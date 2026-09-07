> Adopted from `BLOB_STORED_PATHNAME_WINDOW_PLAN.md` phase 1. Source: `.workflows/plan/blob-stored-pathname-window/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Model the random suffix as its own group, in both predicates, and pin the fixtures to a measured one

**Plan set:** `BLOB_STORED_PATHNAME_WINDOW_PLAN.md`
**Analysis:** `20260907-072534-B10B_code_analyzer.md`
**Satisfies:** R1 (uploading an image in `/admin/photos` must work), R2 (verified by uploading `enina5.png` to prod, not by reading the code)
**Depends on:** none — this is the only phase in the set
**Difficulty:** NORMAL
**Package:** `lib/admin`, `lib/nina` (tests in `tests/` and `lib/nina/`)

> Every line number below is the line as it stands on this branch, base `origin/main` @ `3902c58`,
> **before any step in this plan is applied**. Apply the steps in order and the numbers drift; that
> is expected, and each step quotes enough surrounding text to be located by search instead.

---

## Goal

After this phase, `isAdminChatPhotoPathname` and `isNinaChatRequestPathname` each answer for **two
shapes rather than one range**: the REQUESTED pathname whose id is exactly the 12 symbols `newId()`
emits, and the STORED pathname Vercel hands back, whose id is those 12 symbols plus `-` plus a
random suffix bounded `{16,64}`. An `/admin/photos` upload therefore gets a row instead of an
orphan, and the runner's camera photo reaches `state: 'ready'` instead of *"Nina could not take this
one."* The mint-time check gets **tighter** in the process — `{12,24}` admitted 13–24, which
`newId()` cannot produce — and both unit fixtures stop inventing a short suffix and carry a real
30-symbol one measured out of the prod store, so the window is checked against production reality.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no export, no config key is removed.

**Renames:** nothing. `ADMIN_CHAT_PHOTO_ID_RE` and `NINA_CHAT_ID_RE` keep their names and keep
meaning "the REQUESTED form", which is what both of their non-predicate uses
(`lib/nina/images.ts:87` in `ninaChatPathname`) already needed.

**Creates:**
- `ADMIN_CHAT_PHOTO_STORED_ID_RE` (`lib/admin/chatPhotos.ts`, new export, directly after
  `ADMIN_CHAT_PHOTO_ID_RE`)
- `NINA_CHAT_STORED_ID_RE` (`lib/nina/images.ts`, new export, directly after `NINA_CHAT_ID_RE`)

**Value changes (behaviour-bearing):**
- `ADMIN_CHAT_PHOTO_ID_RE`: `/^[A-Za-z0-9_-]{12,24}$/` -> `/^[A-Za-z0-9_-]{12}$/`
- `NINA_CHAT_ID_RE`: `/^[A-Za-z0-9_-]{12,24}$/` -> `/^[A-Za-z0-9_-]{12}$/`

**Signature changes:** none. `isAdminChatPhotoPathname(pathname, userId)` and
`isNinaChatRequestPathname(pathname, userId)` keep their exact signatures and their exact return
type, so all five call sites compile untouched:
- `app/api/admin/nina/upload/route.ts:153` (requested)
- `lib/admin/chatPhotoActions.ts:113` (stored, replace)
- `lib/admin/chatPhotoActions.ts:182` (stored, add)
- `app/api/upload/route.ts:87` (requested)
- `lib/nina/actions.ts:1237` (stored)

**Behaviour changes at those call sites:**
- Mint sites (`route.ts:153`, `upload/route.ts:87`): **narrower** — a requested id of 13–24 symbols
  is now refused where it was accepted. No caller in the repo ever produced one
  (`components/admin/chatPhotoUpload.ts:112` and `components/nina/Composer.tsx:243` both pass a bare
  `newId()`), so nothing in-tree changes.
- Action sites (`chatPhotoActions.ts:113,182`, `actions.ts:1237`): **wider in exactly one shape** —
  a 43-symbol `<12>-<30>` id is now accepted where it was refused. That is the bug.

**Touches outside the phase's OWNS list, comment-only, zero behaviour** (Step 5, separable — a
reviewer may drop it without breaking anything):
- `components/admin/chatPhotoUpload.ts:103-105` — a docstring sentence that says
  `ADMIN_CHAT_PHOTO_ID_RE` "admits 12-24 symbols"
- `lib/nina/actions.ts:1234-1235` — a comment that says `NINA_CHAT_ID_RE`'s "12..24 bound already
  admits" the stored form

Both are prose that this phase makes factually false. Neither is code. `lib/nina/actions.ts`'s edit
is **above** the pathname check, not in the action body below it.

**Requires (from earlier phases):** nothing — single-phase set, `depends_on: []`.

**Leaves alone (deliberately, verified unaffected in the analysis Reference List):**
- `lib/admin/avatars.ts` — `isAdminAvatarRequestPathname` / `isAdminAvatarThumbRequestPathname`,
  `{12}` exactly, request-only
- `lib/nina/imagerecipe.ts` — `NINA_IMAGE_PATHNAME_RE`, `{12}`, request-only (its prose reference to
  `NINA_CHAT_ID_RE` is in **Handoffs**, because this file is on the phase's MUST-NOT-TOUCH list)
- `lib/extract/constants.ts` — `SHOT_REQUEST_PATHNAME_RE` and `SHOT_STORED_PATHNAME_RE`; the second
  is already correct and is the precedent this phase copies
- `scripts/blob-reap.mjs` — matches by prefix, reads no id regex
- `lib/admin/chatPhotoSchema.ts` — no Zod change. `pathname: z.string().min(1).max(512)` already
  clears a 43-symbol id, and `chatPhotoId` (`{12}`) is `nina_message_images.id`, a database key, not
  a blob id.
- Every `addRandomSuffix: true` (`admin/nina/upload/route.ts:203`, `api/upload/route.ts:91,112`,
  `lib/nina/imagerun.ts:127`) — the suffix is the thing being modelled, not the thing being removed
- `'That file did not land in her photo folder.'` and `'Nina could not take this one.'` — no
  user-visible copy changes
- No migration, no schema change, no new dependency, no new env var

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/chatPhotos.ts` | modify | header ¶ "ONE PREDICATE, TWO WINDOWS" (45-53) rewritten; `ADMIN_CHAT_PHOTO_ID_RE` -> `{12}` and a new `ADMIN_CHAT_PHOTO_STORED_ID_RE` (75-79); predicate return (137) tests both |
| `lib/nina/images.ts` | modify | `NINA_CHAT_ID_RE` -> `{12}` and a new `NINA_CHAT_STORED_ID_RE` with its docstring (63-68); predicate return (113) tests both |
| `tests/admin.chatPhotos.test.ts` | modify | `storedPathname` fixture (36-37) takes a real 30-symbol suffix; `isAdminChatPhotoPathname` describe block (69-93) gains four cases |
| `lib/nina/images.test.ts` | modify | stored-pathname case (36-40) takes a real 30-symbol suffix; three new cases; one new `ninaChatPathname` throw case |
| `components/admin/chatPhotoUpload.ts` | modify (comment only) | 103-105: the "admits 12-24 symbols" sentence |
| `lib/nina/actions.ts` | modify (comment only) | 1234-1235: the "12..24 bound already admits" sentence, above the check |

## Implementation Steps

### Step 0: The worktree has no `node_modules`

**File:** none
**Change:** This worktree was created fresh and `node_modules/` does not exist, so `npx vitest`
resolves a stray copy from the npx cache and dies with `MODULE_NOT_FOUND` on
`vitest.config.ts`'s `vitest/config` import. `.env.local` **does** already exist, so
`lib/env.ts`'s 14-var load-time validation is satisfied and nothing further is needed there.

```bash
cd /home/miftah/.worktrees/run-insights/blob-stored-pathname-window
npm ci
```

**Impact:** none on the tree. Without it every command in **Verification** fails for a reason that
has nothing to do with this change.

---

### Step 1: Rewrite the header paragraph that argues for a window that does not exist

**File:** `lib/admin/chatPhotos.ts:45-53`
**Change:** Replace the whole `── ONE PREDICATE, TWO WINDOWS ──` paragraph. Today it says
*"`ADMIN_CHAT_PHOTO_ID_RE` admits 12-24 ... at mint time (where it is slightly loose ...) and at
action time (where the loose window is exactly right)"* — an arithmetic that was never checked
against an object, and the direct cause of the bug. The paragraph title survives and becomes
literally true: there is still one predicate, and now there really are two windows.

Replace lines 45-53 (from `* ── ONE PREDICATE, TWO WINDOWS ──` through
`* pins the REQUESTED form against `NINA_IMAGE_PATHNAME_RE`'s stricter `{12}`.`) with:

**Code:**
```ts
 * ── ONE PREDICATE, TWO WINDOWS ──────────────────────────────────────────────────────────────
 * `addRandomSuffix: true` means Blob REWRITES the pathname it was asked for, so this module is
 * shown two different shapes and `isAdminChatPhotoPathname` is the only predicate for both:
 *
 *   · REQUESTED — `nina/<userId>/selfie-<12>.jpg`, at the token mint
 *     (`app/api/admin/nina/upload/route.ts:153`)
 *   · STORED — `nina/<userId>/selfie-<12>-<30>.jpg`, at action time
 *     (`lib/admin/chatPhotoActions.ts:113` and `:182`)
 *
 * The numbers are MEASURED, not intended. From the prod store `ptezanncca27s5kn`:
 * `selfie-Q8lWbmk0LG7W-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ.jpg` — a 12-symbol `newId()`, a `-`, and
 * Vercel's 30-symbol suffix, so the id segment is **12 + 1 + 30 = 43**.
 *
 * This window used to be a single range, `{12,24}`, and 43 is outside it: every upload reached the
 * store and then had its row refused with *"That file did not land in her photo folder."* — one
 * orphaned object per click, in a paid store, with the error message pointing at the one thing that
 * had actually succeeded. `{12,24}` was the arithmetic somebody expected, never an object somebody
 * looked at, and the unit fixture that should have caught it had invented a 7-symbol suffix.
 *
 * So the suffix gets ITS OWN GROUP, which is the shape `lib/extract/constants.ts:103-107` already
 * uses and already argues for: `SHOT_STORED_PATHNAME_RE` bounds the suffix `{16,64}` and says why —
 * *"the bound is deliberately loose rather than pinned at the 30 currently observed — this regex's
 * job is our prefix and alphabet, not an internal of Vercel's we do not control."* Two groups
 * rather than one widened range, for two reasons: a single `{12,48}` would ALSO admit a 30-symbol
 * REQUESTED id at mint time, and it would drift again the day Vercel changes the suffix length.
 *
 * The requested half is now `{12}` exactly rather than `{12,24}` — the length `newId()` emits, and
 * the same bound `NINA_IMAGE_PATHNAME_RE` (`lib/nina/imagerecipe.ts:96`) and `lib/admin/avatars.ts`
 * already use. The mint therefore gets TIGHTER here, not looser: 13-24 was always more than
 * `newId()` could produce and no caller in the repo ever asked for it.
 *
 * A 12-symbol `newId()` may itself contain and END with `-` — its alphabet is the 64 URL-safe
 * symbols (`lib/id.ts:11`), and the real object
 * `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg` has the doubled `--` to prove it. That is
 * why the stored pattern anchors the first 12 symbols POSITIONALLY, with a fixed `{12}` quantifier,
 * instead of splitting the id on `-`.
 *
 * `lib/nina/images.ts`'s `NINA_CHAT_ID_RE` had the identical defect from the identical reasoning and
 * is fixed here in the identical shape: the runner's camera upload was failing one screen over as
 * *"Nina could not take this one."* The unit suite pins the REQUESTED form against
 * `NINA_IMAGE_PATHNAME_RE`'s `{12}`, which is now the same number rather than a stricter one.
```

**Impact:** documentation only. No behaviour. This is the paragraph the plan index calls out as
"currently argues for a window that does not exist"; leaving it would leave the file contradicting
the constants two dozen lines below.

---

### Step 2: Split `ADMIN_CHAT_PHOTO_ID_RE` into the requested and stored windows

**File:** `lib/admin/chatPhotos.ts:75-79` (the constant and its docstring), then `:137` (the
predicate's return)

**Change (a).** Replace lines 75-79 — the docstring *"12 requested, up to 24 stored once Blob has
appended its random suffix. See the header's 'one predicate, two windows'."* and the constant
itself — with two constants:

**Code:**
```ts
/**
 * What the client may ASK for: a `newId()`, and nothing longer. `lib/id.ts`'s `ID_LENGTH` is 12,
 * `components/admin/chatPhotoUpload.ts:112` is the only caller and it passes a bare `newId()`, so
 * `{12}` exactly — the same bound `NINA_IMAGE_PATHNAME_RE` (`lib/nina/imagerecipe.ts:96`) and
 * `lib/admin/avatars.ts` already use for their own request-only shapes.
 *
 * This used to read `{12,24}` and try to cover the stored form with the same range. It could not:
 * see `ADMIN_CHAT_PHOTO_STORED_ID_RE` and the header's "one predicate, two windows".
 */
export const ADMIN_CHAT_PHOTO_ID_RE = /^[A-Za-z0-9_-]{12}$/

/**
 * What Blob actually STORED, which is what `lib/admin/chatPhotoActions.ts` re-validates: the
 * requested 12 symbols, a `-`, and Vercel's random suffix. 43 symbols in every object measured in
 * the prod store, of which 30 are the suffix — 12 + 1 + 30.
 *
 * The suffix is bounded `{16,64}` rather than pinned at 30 because it is an internal of Vercel's we
 * do not control; that bound and that argument are `SHOT_STORED_PATHNAME_RE`'s, verbatim
 * (`lib/extract/constants.ts:103-107`), and this is deliberately the fourth copy of a number rather
 * than a fifth shared module — RULING A6 keeps `lib/nina/images.ts` zero-import, and
 * `lib/extract/constants.ts` already keeps its own.
 *
 * The leading `{12}` is a FIXED quantifier on purpose. A `newId()` draws from the 64 URL-safe
 * symbols (`lib/id.ts:11`), so it may itself contain and end with `-` — real object
 * `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg`. The separator is therefore found by
 * POSITION and never by splitting on `-`, and the first group cannot be greedy enough to swallow
 * part of the suffix.
 */
export const ADMIN_CHAT_PHOTO_STORED_ID_RE = /^[A-Za-z0-9_-]{12}-[A-Za-z0-9_-]{16,64}$/
```

**Change (b).** `lib/admin/chatPhotos.ts:137` — the predicate's last line, today

```ts
  return ADMIN_CHAT_PHOTO_ID_RE.test(file.slice(head.length, -tail.length))
```

becomes:

```ts
  // TWO WINDOWS, one predicate — see the header. The mint hands us the requested form, the two
  // Server Actions hand us the form Blob stored; either is a legitimate answer of `true` and
  // neither is expressible as a widening of the other's range.
  const id = file.slice(head.length, -tail.length)
  return ADMIN_CHAT_PHOTO_ID_RE.test(id) || ADMIN_CHAT_PHOTO_STORED_ID_RE.test(id)
```

For completeness, `isAdminChatPhotoPathname` in full after this step — this is the whole function,
lines 110-138 today, docstring included, with one paragraph appended to the docstring and the last
line replaced:

```ts
/**
 * The path-traversal defence and the "do not write beside anything else in the store" defence, in
 * one predicate — and written **segment by segment rather than by interpolating `userId` into a
 * RegExp**, which is `isNinaChatRequestPathname`'s rule and the stronger of the two precedents in
 * this repo: *"a user id is data, and data does not belong in a pattern."*
 * `isAdminAvatarRequestPathname` builds a pattern instead, and guards it with an alphabet test
 * first; this does not need the guard because it never builds one.
 *
 * The user id is INTERPOLATED FROM THE SESSION by the route and by every action, never taken from
 * the request, so a client cannot write into another user's folder even though there is one user.
 *
 * The id segment is checked against BOTH windows, because this one predicate is called with the
 * requested pathname at mint time and with the stored one at action time. See the header.
 */
export function isAdminChatPhotoPathname(pathname: string, userId: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return false

  const parts = pathname.split('/')
  if (parts.length !== 3) return false
  const [prefix, owner, file] = parts

  // `NINA_BLOB_PREFIX` is `'nina/'`; as a path SEGMENT it is the same string without the slash.
  if (prefix !== NINA_BLOB_PREFIX.slice(0, -1)) return false
  if (owner !== userId) return false
  if (file == null) return false

  const head = `${ADMIN_CHAT_PHOTO_PURPOSE}-`
  const tail = `.${ADMIN_CHAT_PHOTO_EXT}`
  if (!file.startsWith(head) || !file.endsWith(tail)) return false

  // TWO WINDOWS, one predicate — see the header. The mint hands us the requested form, the two
  // Server Actions hand us the form Blob stored; either is a legitimate answer of `true` and
  // neither is expressible as a widening of the other's range.
  const id = file.slice(head.length, -tail.length)
  return ADMIN_CHAT_PHOTO_ID_RE.test(id) || ADMIN_CHAT_PHOTO_STORED_ID_RE.test(id)
}
```

**Impact:** this is the R1 fix for `/admin/photos`. `addChatPhotoAction`
(`lib/admin/chatPhotoActions.ts:182`) and `replaceChatPhotoAction` (`:113`) now pass the check and
reach `resolveNinaWriteSession` / `insertNinaMessages` / `insertNinaMessageImages` /
`scheduleChatPhotoDescribe`. The mint at `app/api/admin/nina/upload/route.ts:153` narrows from
12–24 to 12; nothing in the repo mints anything but 12.

---

### Step 3: The same split in `lib/nina/images.ts`

**File:** `lib/nina/images.ts:63-68` (the constant and its docstring), then `:113` (the predicate's
return)

This file is **zero-import by RULING A6** — its header states that three hosts break at runtime
rather than at `tsc` if it grows an import — so the fix goes in place. No shared
`BLOB_RANDOM_SUFFIX_RE` module; that is the plan index's Decisions-table ruling and this step
honours it rather than relitigating it.

**Change (a).** Replace lines 63-68 with:

**Code:**
```ts
/**
 * What the browser may ASK for. `lib/id.ts`'s `newId()` is 12 symbols over the URL-safe alphabet,
 * and `{12}` exactly is all `ninaChatPathname` below is ever handed —
 * `components/nina/Composer.tsx:243` passes a bare `newId()`.
 *
 * This read `{12,24}` until the stored form was measured, on the theory that one range could cover
 * both windows. It could not: see `NINA_CHAT_STORED_ID_RE` directly below.
 */
export const NINA_CHAT_ID_RE = /^[A-Za-z0-9_-]{12}$/

/**
 * What Vercel actually STORED. `addRandomSuffix: true` (`app/api/upload/route.ts:91`) rewrites the
 * pathname, appending `-` plus a run of URL-safe symbols, and `describeNinaImage`
 * (`lib/nina/actions.ts:1237`) re-validates THAT form — so `isNinaChatRequestPathname` has to answer
 * for both windows, and this is the second one.
 *
 * MEASURED against the prod store, not intended: `chat/<12>-<30>.jpg`, id segment
 * **12 + 1 + 30 = 43**. The single `{12,24}` range that stood here refused all 43 of them, so every
 * camera upload landed in the store and then failed its describe as *"Nina could not take this
 * one."* — one orphaned object per attempt, four of them counted in the store — and the unit fixture
 * that was supposed to catch it had invented a 3-symbol suffix.
 *
 * `{16,64}` rather than 30 because the suffix is an internal of Vercel's we do not control. The
 * bound and the argument are `SHOT_STORED_PATHNAME_RE`'s (`lib/extract/constants.ts:103-107`), the
 * one place in the repo that got this right the first time, from a real observation rather than from
 * expected arithmetic.
 *
 * The leading `{12}` is a FIXED quantifier so the separator is located by POSITION: a `newId()` may
 * itself contain and end with `-`, as `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg` does
 * with its doubled `--`, and splitting the id on `-` would mis-read it.
 */
export const NINA_CHAT_STORED_ID_RE = /^[A-Za-z0-9_-]{12}-[A-Za-z0-9_-]{16,64}$/
```

**Change (b).** `ninaChatPathname` (lines 84-91) keeps `NINA_CHAT_ID_RE` and therefore gets
correctly stricter — it BUILDS a requested pathname, so a stored-form id is not a thing it may be
asked for. One docstring sentence is added to say so. The whole function after the change:

```ts
/**
 * What the browser is allowed to ASK for. Vercel appends its own random suffix on top.
 *
 * Validated against `NINA_CHAT_ID_RE` and deliberately NOT against `NINA_CHAT_STORED_ID_RE`: this
 * function builds the requested form, so being handed an already-stored id is a caller bug and a
 * throw is the right answer to it.
 */
export function ninaChatPathname(userId: string, id: string): string {
  assertPathSegment(userId)
  if (!NINA_CHAT_ID_RE.test(id)) {
    throw new Error(`ninaChatPathname: bad image id ${JSON.stringify(id)}`)
  }
  return `${NINA_BLOB_PREFIX}${userId}/${NINA_CHAT_SEGMENT}/${id}.jpg`
}
```

**Change (c).** `isNinaChatRequestPathname` — line 113's return. The whole function after the
change, docstring included:

```ts
/**
 * The whole of the path-traversal and don't-write-beside-anything-else defence for the chat
 * branch, and **stronger than F04's `SHOT_REQUEST_PATHNAME_RE`**: this does not merely check an
 * alphabet, it binds the requested path to the AUTHENTICATED user. A signed-in runner cannot mint
 * a token that writes into another user's prefix, which matters because `proxy.ts` deliberately
 * does not match `/api/*` and `getUserId()` in the route is the only thing between the open
 * internet and a writable blob store.
 *
 * Compared segment by segment rather than by interpolating `userId` into a RegExp: a user id is
 * data, and data does not belong in a pattern.
 *
 * TWO WINDOWS, despite the `Request` in the name: `app/api/upload/route.ts:87` calls this with the
 * REQUESTED pathname and `lib/nina/actions.ts:1237` calls it with the one Blob STORED, so the id
 * segment is matched against `NINA_CHAT_ID_RE` or `NINA_CHAT_STORED_ID_RE`. Two patterns rather
 * than one widened range, because a widened range would also let the mint authorise a 43-symbol
 * requested id, and because the suffix length is not ours to fix.
 */
export function isNinaChatRequestPathname(pathname: string, userId: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return false
  const parts = pathname.split('/')
  if (parts.length !== 4) return false
  const [prefix, owner, segment, file] = parts
  if (prefix !== 'nina') return false
  if (owner !== userId) return false
  if (segment !== NINA_CHAT_SEGMENT) return false
  if (file == null || !file.endsWith('.jpg')) return false
  const id = file.slice(0, -'.jpg'.length)
  return NINA_CHAT_ID_RE.test(id) || NINA_CHAT_STORED_ID_RE.test(id)
}
```

**Impact:** `describeNinaImage` stops returning `{ ok: false, reason: 'rejected' }` for a
well-formed camera upload, so `components/nina/Composer.tsx:257-267` reaches `state: 'ready'`
instead of *"Nina could not take this one."* This is the second route to R1 that the analysis
found; it ships in the same commit because it is the same arithmetic in the same shape.

---

### Step 4: Pin both fixtures to a measured suffix, and add the regression cases

#### 4a. `tests/admin.chatPhotos.test.ts`

**File:** `tests/admin.chatPhotos.test.ts:36-38` and `:69-93`

**Change (a).** Replace lines 36-38 (the `storedPathname` comment, the constant, and `storedUrl`).
The invented `-Xy7kQ2p` is the reason the defect shipped green; the replacement is a suffix copied
verbatim out of the prod store, the same one the R2 probe's own object carried.

**Code:**
```ts
/**
 * Vercel's random suffix, copied VERBATIM from the prod store rather than invented:
 * `nina/…/selfie-Q8lWbmk0LG7W-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ.jpg`, the object the R2 reproduction
 * wrote. This constant used to read `Xy7kQ2p` — 7 symbols, id segment 20, comfortably inside the
 * old `{12,24}` window — while every real upload, id segment 43, was being refused. Inventing it
 * was the defect; measuring it is the fix.
 */
const BLOB_SUFFIX = 'yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ'

/** What Blob hands back: the requested pathname plus its random suffix. 12 + 1 + 30 = 43. */
const storedPathname = `nina/${USER}/selfie-${ID}-${BLOB_SUFFIX}.jpg`
const storedUrl = `${STORE}/${storedPathname}`
```

`goodBlob` (lines 40-46) is unchanged and picks the new `storedPathname` up for free. The longer
pathname stays well inside `chatPhotoSchema.ts`'s `pathname: z.string().min(1).max(512)` and inside
`ADMIN_CHAT_PHOTO_MAX_URL_CHARS` (2048), so the three schema describes and the two URL describes
keep passing untouched.

**Change (b).** Replace the entire `describe('isAdminChatPhotoPathname', …)` block, lines 69-93:

**Code:**
```ts
describe('isAdminChatPhotoPathname', () => {
  it('accepts the requested form and the stored form the branch will actually see', () => {
    expect(isAdminChatPhotoPathname(adminChatPhotoPathname(USER, ID), USER)).toBe(true)
    expect(isAdminChatPhotoPathname(storedPathname, USER)).toBe(true)
  })

  it('is checked against a REAL stored id — 43 symbols, not an invented short one', () => {
    // The fixture IS the test. This assertion exists so a later edit cannot quietly shorten the
    // suffix back to something the requested-form pattern would have accepted on its own, which is
    // exactly how a predicate that refused every production upload shipped green.
    expect(BLOB_SUFFIX).toHaveLength(30)
    const id = storedPathname.slice(`nina/${USER}/selfie-`.length, -'.jpg'.length)
    expect(id).toBe(`${ID}-${BLOB_SUFFIX}`)
    expect(id).toHaveLength(43)
  })

  it('accepts a stored id whose requested half ENDS in a dash', () => {
    // `newId()` draws from the 64 URL-safe symbols, so a 12-symbol id can both contain and end
    // with `-`. Real object: `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg`, note the
    // doubled `--`. The separator has to be found by position; splitting on `-` mis-reads this.
    const dashy = 'Ve394_KsZZ7-'
    expect(dashy).toHaveLength(12)
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${dashy}-${BLOB_SUFFIX}.jpg`, USER)).toBe(
      true,
    )
  })

  it('refuses another user folder, traversal, and the album prefix', () => {
    expect(isAdminChatPhotoPathname(storedPathname, 'someoneelse')).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/../selfie-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/thumb-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`shots/${ID}.jpg`, USER)).toBe(false)
  })

  it('refuses the worker PNG container and a double extension', () => {
    expect(isAdminChatPhotoPathname(ninaImagePathname(USER, 'selfie', ID), USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}.jpg.html`, USER)).toBe(false)
  })

  it('refuses a requested id that is not exactly 12, and a non-id user', () => {
    // TIGHTER than the window this replaced. `{12,24}` admitted 13-24, which `newId()` cannot
    // produce and which no caller in the repo ever asked for; the mint-time check must not get
    // looser in order for the action-time one to start working.
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-short.jpg`, USER)).toBe(false)
    for (const n of [11, 13, 18, 24, 25]) {
      expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${'a'.repeat(n)}.jpg`, USER)).toBe(false)
    }
    expect(isAdminChatPhotoPathname(storedPathname, '../evil')).toBe(false)
  })

  it('refuses a suffix outside the recorded 16-64 bound, and one that is not a suffix', () => {
    // `{16,64}` is `SHOT_STORED_PATHNAME_RE`'s bound, deliberately loose around the 30 observed.
    // Loose is not unbounded: the alphabet, the separator and the shape are still ours to enforce.
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}-${'b'.repeat(15)}.jpg`, USER)).toBe(
      false,
    )
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}-${'b'.repeat(65)}.jpg`, USER)).toBe(
      false,
    )
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}.${BLOB_SUFFIX}.jpg`, USER)).toBe(
      false,
    )
  })
})
```

#### 4b. `lib/nina/images.test.ts`

**File:** `lib/nina/images.test.ts:23-26` (one added case in the `ninaChatPathname` describe) and
`:36-40` (the stored case, plus three added ones)

**Change (a).** Inside `describe('ninaChatPathname', …)`, replace the `refuses a bad image id` case
at lines 23-26 with that case plus two more:

**Code:**
```ts
  it('refuses a bad image id', () => {
    expect(() => ninaChatPathname('user_abc123', 'short')).toThrow()
    expect(() => ninaChatPathname('user_abc123', 'has.a.dot12')).toThrow()
  })

  it('refuses an id longer than newId() — `{12}` exactly, so the mint cannot drift', () => {
    // The window this replaced was `{12,24}` and would have built a pathname from any of these.
    for (const n of [13, 18, 24]) {
      expect(() => ninaChatPathname('user_abc123', 'a'.repeat(n))).toThrow()
    }
  })

  it('refuses a STORED-form id: this builds the pathname we ASK for', () => {
    expect(() =>
      ninaChatPathname('user_abc123', 'aaaaaaaaaaaa-Pikq5mB56ZG2mBjkWsSpNVIn8M8oyw'),
    ).toThrow()
  })
```

**Change (b).** Inside `describe('isNinaChatRequestPathname', …)`, replace the stored-pathname case
at lines 36-40 with a real-suffix constant and four cases. Insert `SUFFIX` next to the existing
`const mine = …` at line 30.

**Code:**
```ts
  /**
   * A REAL suffix, copied out of the prod store (`nina/…/avatar-DlA2teEDtOPP-Pikq5mB…oyw.jpg`)
   * rather than invented. This case used to assert `chat/aaaaaaaaaaaa-Xy7.jpg` — a 3-symbol suffix,
   * id segment 16, comfortably inside the old `{12,24}` — while every actual camera upload, id
   * segment 43, was being refused and orphaning its blob.
   */
  const SUFFIX = 'Pikq5mB56ZG2mBjkWsSpNVIn8M8oyw'

  it('accepts the stored pathname, which carries Vercel’s random suffix', () => {
    expect(SUFFIX).toHaveLength(30)
    const stored = `nina/user_abc123/chat/aaaaaaaaaaaa-${SUFFIX}.jpg`
    expect(stored.slice('nina/user_abc123/chat/'.length, -'.jpg'.length)).toHaveLength(43)
    expect(isNinaChatRequestPathname(stored, 'user_abc123')).toBe(true)
  })

  it('accepts a stored id whose requested half ends in a dash', () => {
    // `newId()`'s alphabet includes `-`, so the separator cannot be found by splitting. Real
    // object: `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg`.
    expect(
      isNinaChatRequestPathname(`nina/user_abc123/chat/Ve394_KsZZ7--${SUFFIX}.jpg`, 'user_abc123'),
    ).toBe(true)
  })

  it('refuses a requested id that is not exactly 12 — the mint check stays tight', () => {
    for (const n of [11, 13, 18, 24, 25]) {
      expect(
        isNinaChatRequestPathname(`nina/user_abc123/chat/${'a'.repeat(n)}.jpg`, 'user_abc123'),
      ).toBe(false)
    }
  })

  it('refuses a suffix outside the recorded 16-64 bound', () => {
    // 3 is what this suite used to assert as a stored suffix. It never was one.
    for (const n of [3, 15, 65]) {
      expect(
        isNinaChatRequestPathname(
          `nina/user_abc123/chat/aaaaaaaaaaaa-${'b'.repeat(n)}.jpg`,
          'user_abc123',
        ),
      ).toBe(false)
    }
  })
```

**Impact — which of these fail on `origin/main` @ `3902c58`.** This is the regression proof, and
there are five independent ones. Every expectation below was checked against both the old
`/^[A-Za-z0-9_-]{12,24}$/` and the new pair before this plan was written:

| Case | On `origin/main` | After this phase |
|---|---|---|
| `admin` — "is checked against a REAL stored id" (30-symbol `BLOB_SUFFIX`, id 43) makes `storedPathname` 43 symbols, so the first case's `isAdminChatPhotoPathname(storedPathname, USER)` | **FAILS** — `{12,24}` refuses 43 | passes |
| `admin` — "accepts a stored id whose requested half ENDS in a dash" | **FAILS** — refuses 43 | passes |
| `admin` — "refuses a requested id that is not exactly 12" at `n = 13, 18, 24` | **FAILS** — `{12,24}` accepts them | passes |
| `nina` — "accepts the stored pathname" with the 30-symbol `SUFFIX` | **FAILS** — refuses 43 | passes |
| `nina` — "refuses a suffix outside the recorded 16-64 bound" at `n = 3` (16 total) and `n = 15` (28 total) | **FAILS** — `{12,24}` accepts 16; 28 it already refuses | passes |
| `nina` — "refuses an id longer than newId()" at `n = 13, 18, 24` | **FAILS** — `ninaChatPathname` does not throw | passes |

The first row is the one to quote in the PR body: it is the exact production shape, with the exact
production suffix, asserted on the exact predicate the user's screenshot was produced by.

---

### Step 5: Two prose references that this change makes false (comment-only, separable)

Both files are outside the phase's OWNS list and neither has any code changed. They are included
because this is a single-phase set — there is no later phase to hand them to — and because a comment
that names a bound the code no longer has is how `{12,24}` survived review the first time. A
reviewer who disagrees can drop this step with no effect on anything.

**Change (a).** `components/admin/chatPhotoUpload.ts:103-105`, inside `uploadChatPhoto`'s docstring.
Today:

```ts
 * `adminChatPhotoPathname` is what the client may ASK for; Blob rewrites it with a random suffix and
 * the STORED pathname is whatever `upload` returned — which is why `ADMIN_CHAT_PHOTO_ID_RE` admits
 * 12-24 symbols and why the actions re-validate the returned pathname rather than the requested one.
```

Becomes:

```ts
 * `adminChatPhotoPathname` is what the client may ASK for; Blob rewrites it with a random suffix and
 * the STORED pathname is whatever `upload` returned — 43 symbols in the id segment, not 12 — which is
 * why `lib/admin/chatPhotos.ts` carries a SECOND pattern, `ADMIN_CHAT_PHOTO_STORED_ID_RE`, and why
 * the actions re-validate the returned pathname rather than the requested one.
```

**Change (b).** `lib/nina/actions.ts:1229-1236`, the comment **above** the pathname check in
`describeNinaImage` — not the action body below it. Today its last sentence reads *"The stored
pathname carries Vercel's random suffix, so the id segment is longer than the requested one — which
`NINA_CHAT_ID_RE`'s 12..24 bound already admits."* The whole comment, after the change:

```ts
  /*
   * The pathname arrives from the client, so it is re-checked here even though the upload route
   * already checked it: this action's own INSERT-shaped claims (pathname, blobUrl) are about to be
   * signed, and signing something unvalidated is how a signature becomes a laundering service.
   * The stored pathname carries Vercel's random suffix, so the id segment is longer than the
   * requested one — 12 + 1 + 30 = 43, measured — which `NINA_CHAT_STORED_ID_RE` admits as its own
   * group. `NINA_CHAT_ID_RE` is the requested half only and is `{12}` exactly; a single range
   * covering both is what refused every upload this route ever saw.
   */
```

**Impact:** none. Comments.

---

## Verification

Run from the worktree root,
`/home/miftah/.worktrees/run-insights/blob-stored-pathname-window`, after Step 0's `npm ci`.

**Targeted, first — the two suites this phase owns:**
```bash
npx vitest run tests/admin.chatPhotos.test.ts lib/nina/images.test.ts
```

**Regression proof — the same command on the base, which must FAIL:**
```bash
git stash && npx vitest run tests/admin.chatPhotos.test.ts lib/nina/images.test.ts ; git stash pop
```
Expect red on the six rows in Step 4's table. If it comes back green, the fixtures were not actually
pinned to a real suffix and Step 4 is not done.

**Build:**
```bash
npm run typecheck
npm run lint
```

**Tests (whole suite — nothing else may move):**
```bash
npm test
```

**Manual check, local:** `npm run dev`, sign in as the admin, open `/admin/photos`, add
`enina5.png`. "Nina generated" goes from 0 photos to 1, the red `<li>` from
`components/admin/ChatPhotoAdd.tsx:49` does not appear, and a `nina_message_images` row exists with
`kind = 'generated'` and a 43-symbol id segment in `pathname`.

**Exit criteria:**
1. `npm run typecheck`, `npm run lint`, `npm test` all green.
2. Each predicate has a test asserting it accepts a stored pathname whose suffix is exactly 30
   symbols, and that assertion fails on `origin/main` @ `3902c58`.
3. Each predicate has a test asserting it refuses a requested id of 13–24 symbols (invariant 2 —
   the mint got tighter, not looser).
4. Each predicate has a test asserting a 12-symbol id ending in `-`, plus a 30-symbol suffix, is
   accepted (invariant 4).
5. Neither fixture contains an invented suffix any more; both `BLOB_SUFFIX` and `SUFFIX` are
   asserted to be 30 symbols long in the suite itself.
6. **The prod probe below is re-run against the deployed branch and passes.**

---

## Post-deploy prod verification (R2 — required, not optional)

R2 is *"upload `enina5.png` to prod myself rather than reasoning from the code"*. The analysis
already ran this end to end on the broken code and recorded the transcript; this is the same probe
re-run on the fixed code, and it is the phase's real exit criterion. Two halves: a scripted probe
that proves the handshake and the predicate, then a browser upload that proves the feature.

**Mint the session cookie locally.** Auth.js runs `strategy: 'jwt'` (`auth.config.ts:59`), so the
cookie is a self-contained JWE and no database session row is involved. From
`@auth/core/jwt` (v0.41.3, already installed):

```ts
import { encode } from '@auth/core/jwt'

const cookie = await encode({
  token: {
    sub: '24076314-d36f-44f1-a50f-4acc660b5d7b',
    email: 'mahfuzh74@gmail.com',
  },
  secret: process.env.AUTH_SECRET!,
  salt: '__Secure-authjs.session-token',
})
// send as: Cookie: __Secure-authjs.session-token=<cookie>
```

The salt and the cookie name must be the same string — that is Auth.js v5's derivation, and getting
it wrong yields a silent 302 to `/` rather than an error. `mahfuzh74@gmail.com` has to be in
`ADMIN_EMAILS` for `requireAdminApi()` (`isAdminEmail`, via `lib/env.ts`) to let the handshake
through.

**Probe, in order:**

1. `GET /admin/photos` with that cookie -> `200`. A `302` means the cookie did not decode; nothing
   after this is worth running.
2. Build the REQUESTED pathname: `nina/24076314-d36f-44f1-a50f-4acc660b5d7b/selfie-<newId()>.jpg`.
   Assert the id segment is 12 symbols before sending it.
3. `POST /api/admin/nina/upload` with `Content-Type: application/json` and the
   `handleUpload` handshake body — `@vercel/blob@2.8.0`'s `GenerateClientTokenEvent`, which in this
   version carries no `callbackUrl`:
   ```json
   {
     "type": "blob.generate-client-token",
     "payload": {
       "pathname": "nina/24076314-…/selfie-<12>.jpg",
       "multipart": false,
       "clientPayload": "{\"contentType\":\"image/jpeg\"}"
     }
   }
   ```
   Expect `200` and `{ "type": "blob.generate-client-token", "clientToken": "vercel_blob_client_…" }`.
   The `clientPayload` must declare `image/jpeg` or `route.ts`'s chat-photo branch throws
   `Invalid pathname` — that is `route.ts:167-169`, not this bug.
4. PUT the bytes with the client token:
   ```ts
   import { put } from '@vercel/blob'
   const res = await put(pathname, bytes, {
     access: 'public',
     token: clientToken,
     contentType: 'image/jpeg',
   })
   ```
   `bytes` is `enina5.png` (repo root, 892x1200 RGBA PNG, 1,839,968 bytes) put through
   `encodeChatPhotoJpeg`'s exact recipe — long edge clamped to 1024, a white ground painted under
   the alpha channel, JPEG q0.90 — which yields **761x1024, ~125 KB** and clears the 2 MB
   `maximumSizeInBytes`. Pillow reproduces it; the raw PNG does not (wrong container, and the
   token allows only `image/jpeg`).
5. Measure `res.pathname`. Assert the id segment is **43** symbols and that
   `isAdminChatPhotoPathname(res.pathname, userId)` is now `true`. On `origin/main` step 5 is where
   the probe went red.
6. `POST` the add through the Server Action path — or, simpler and equally conclusive, assert the
   predicate directly and then do the browser half below, which exercises the action for real.
7. **Delete the probe's own object.** The analysis's probe left an orphan and had to clean up by
   hand; do the same here rather than adding a sixteenth.

**The browser half, which is what R2 actually asked for.** On the deployed URL for this branch,
signed in as the admin in a real browser: `/admin/photos` -> **Add photo** -> `enina5.png`. Expect
no red `<li>`, "Nina generated" to read **1 photo**, the thumbnail to render, and

```sql
SELECT id, kind, length(pathname), pathname FROM nina_message_images;
```

to return one row with `kind = 'generated'` and a `pathname` whose id segment is 43 symbols. Before
this phase that table has **0** rows on prod.

For the preview deployment rather than `runins.site`: the deployment is behind Vercel's protection,
so the bypass token has to come from `vercel curl --debug` on the preview URL, and deployment logs
read with `--since` rather than `--follow`. Confirm the bytes actually landed by listing the store
prefix, not by trusting the UI.

**Note for the PR body.** The prod Blob store (`ptezanncca27s5kn`) currently holds **15 orphaned
objects, ~7.6 MB** — 4 `nina/<uid>/selfie-*.jpg` and 4 `nina/<uid>/chat/*.jpg` that are this bug's
direct residue, one per refused click, plus 7 `.png` selfies whose rows were cascade-deleted with
their chat sessions by the recently-merged "a deleted session is really deleted" work. Mention the
count and point at the **`reap-orphaned-blobs`** skill. Do **not** script the sweep in this commit:
a data-deleting sweep is not a bug fix, and the plan index rules it out of scope explicitly.

---

## Handoffs

Found while planning, deliberately left out. This is a single-phase set, so each of these is a
follow-up card rather than another phase's work.

1. **`lib/nina/imagerecipe.ts:92`** — `NINA_IMAGE_PATHNAME_RE`'s docstring says the stored form is
   *"deliberately not matched against it — exactly the distinction `lib/nina/images.ts`'s
   `NINA_CHAT_ID_RE` draws by admitting 12-24 symbols."* The clause about the distinction stays
   true; the "by admitting 12-24 symbols" half becomes false. This file is on the phase's
   **MUST NOT TOUCH** list, so it is left exactly as it is. One-line comment fix, no behaviour.

2. **`isNinaChatRequestPathname` is misnamed** now that it answers for both windows —
   `isNinaChatPathname` would be honest. Renaming touches `app/api/upload/route.ts:87`,
   `lib/nina/actions.ts:1237` and `lib/nina/images.test.ts`, i.e. the check lines themselves in two
   files this phase must not restructure. Documented in the docstring instead (Step 3c).

3. **Residual mint-time looseness.** With one predicate answering for both windows, the mint sites
   also accept a *requested* pathname that is already in stored shape (`<12>-<16,64>`). Measured
   consequence: Blob appends a second suffix, giving `<12>-<30>-<30>` = a 74-symbol id whose suffix
   group is 61 (30 + 1 + 30) — still inside `{16,64}`, so the action accepts it and a row is written
   rather than an orphan being left. Harmless, and
   no client in the repo can produce it (`chatPhotoUpload.ts:112` and `Composer.tsx:243` both pass a
   bare `newId()`). Closing it properly means either a third parameter or two predicates per shape,
   which changes signatures across `app/api/admin/nina/upload/route.ts`,
   `lib/admin/chatPhotoActions.ts`, `app/api/upload/route.ts` and `lib/nina/actions.ts` — all outside
   this phase's OWNS list, and none of it is what the user reported.

4. **`'That file did not land in her photo folder.'` is factually inverted** — the file *did* land;
   it was the row that was refused. Once this phase lands, the branch stops being reachable by a
   well-formed upload, and the plan index rules copy changes out of scope. Worth a card anyway: the
   next person to hit that string will be misled by it exactly as this bug's reader was.

5. **Nothing releases the blob on this refusal.** `releaseChatPhotoBlob` is only called on the two
   failure paths *below* the pathname check (`lib/admin/chatPhotoActions.ts`), which is why each
   refused click orphaned an object. This phase removes the cause; the missing release above the
   check remains, and would orphan again for any future reason the check fails.

6. **The four `{12}` request-only patterns stay tight** and must not be "helpfully" widened by a
   later reader who sees this fix: `lib/admin/avatars.ts:87,148`, `lib/nina/imagerecipe.ts:96`,
   `lib/extract/constants.ts:101`. Their tightness is the mint-time defence and none of them is ever
   handed a stored pathname.

## Rollback

`git revert` the single commit, or discard the six file edits. Nothing is persisted: no migration
runs, no schema changes, no dependency is added, no env var is read, no Blob object is written or
deleted by the code change, and no user-visible copy moves. Reverting returns both predicates to
refusing every stored pathname — today's behaviour exactly, orphans and all.

The prod probe's own object is the only side effect of verification, and the probe deletes it
itself (Post-deploy step 7). The browser half's upload is a legitimate row and should be kept; if
it is not wanted, remove it through `/admin/photos`' own remove control, which handles the message
and the blob together via `isNinaPhotoCarrierMessage`.
