# Phase 4: Push when a photo is added to her chat from `/admin`

**Plan set:** `NINA_PUSH_EVERY_MESSAGE_PLAN.md`
**Analysis:** `20260914-102749-C7K2_code_analyzer.md`
**Satisfies:** R2 — *"whether it is her own initiatives"*: the runner drops a photograph into Nina's
chat from `/admin` and his phone tells him it arrived.
**Depends on:** Phase 1 (`lib/push/send.ts`'s `notifyNinaPush` + `NinaPushKind`'s
`'admin_chat_photo'`)
**Difficulty:** EASY
**Package:** `lib/admin`

---

## Goal

`addChatPhotoAction` writes a `nina_messages` row with `role: 'nina'` and `photoOnly: true` plus its
`nina_message_images` row, and today nothing tells the phone — that file's own comment at line 779
already says the bubble is expected to arrive by "service-worker refresh", which never fires,
because the worker's `postMessage` only happens inside its `push` handler and no push is sent.
After this phase, one notify call sits past every one of that action's error returns, so a photo
that landed buzzes the XS Max with the bubble's caption, and a photo that did not land announces
nothing.

## Interface Contract

**Deletes:** none
**Renames:** none
**Creates:** none (no new exported symbol; this phase adds one call site and one local `const`)
**Signature changes:** none
**Requires (from earlier phases):**

Both **settled against `phase-1.md`**, not assumed:

- Phase 1 — `lib/push/send.ts` exports `notifyNinaPush`, a caller-facing notifier with its own
  `catch` (so it never throws) whose `kind` is NOT narrowed to `ProactiveTriggerKind`. Signature:
  `(userId: string, messages: ReadonlyArray<{ id: string; body: string }>, kind: NinaPushKind) => Promise<void>`.
- Phase 1 — `lib/push/payload.ts` exports `NinaPushKind`, and the literal for the admin-added chat
  photo is **`'admin_chat_photo'`** — phase 1's kind table names this file as its only writer.

This origin keeps its own value rather than sharing phase 3's `'photo_delivered'` or phase 5's
`'worker_photo_delivered'`: `kind` is diagnostics only, and a `[push] notified` line must be able
to say a photograph came from an operator at `/admin` rather than from a generation she was asked
for. The two literals appear in **exactly two places** in this phase — the import line in Step 1 and
the single call in Step 3, mirrored by the test's `vi.mock` factory and one assertion in Step 5.

**Leaves alone (owned by others):**

- `lib/nina/turnrun.ts` (Phase 2)
- `lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts` (Phase 3)
- `lib/push/**` (Phase 1) — this phase **imports** from `lib/push/send.ts` and edits nothing in it
- `scripts/nina-image-worker/**`, `.github/workflows/nina-image.yml` (Phase 5)
- `lib/nina/proactive.ts` — byte-identical (plan invariant 1)
- The rest of `lib/admin`, and the other five actions in the file I do touch

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/chatPhotoActions.ts` | modify | import `notifyNinaPush` (after `:46`); hoist the bubble's caption into a `const body` (`:303–308`); one `try`-wrapped notify between `scheduleChatPhotoCaption` and `revalidatePath` (`:366–368`) |
| `tests/admin.chatPhotos.test.ts` | modify | add the `@/lib/push/send` mock (handle at `:404`, factory at `:446`, default at `:499`); add one `describe` block of seven cases after `:793` |

## Implementation Steps

### Step 1: Import the phase-1 notifier

**File:** `lib/admin/chatPhotoActions.ts:46`
**Change:** Add one import, after `@/lib/photos/contentHash` — `photos` sorts before `push`, which is
the order the rest of the `@/lib/*` block is in. The file already opens with `'use server'`, so
`lib/push/send.ts`'s `import 'server-only'` is satisfied, and its `web-push` dependency is a runtime
dependency this app already ships.

**Code:** the block as it reads after the edit (lines 44–47 today become 44–48):

```ts
import { resolveNinaWriteSession } from '@/lib/nina/sessionResolve'
import { NinaVisionTokenFloorError, describeNinaImages } from '@/lib/nina/vision'
import { isValidContentHash } from '@/lib/photos/contentHash'
import { notifyNinaPush } from '@/lib/push/send'
```

**Impact:** Pulls `web-push`, `lib/env`'s `pushEnv` and `lib/push/queries` into this module's graph.
Nothing evaluates at import time that can throw — `pushEnv()` is lazy and is called inside
`sendNinaPush`'s own `try` — so a deployment with no `VAPID_*` still loads this file (plan invariant
4). The test file mocks `@/lib/push/send` wholesale, so neither `web-push` nor the env validator is
reached by the suite (plan invariant 7).

---

### Step 2: Mint the bubble's words once, and use them twice

**File:** `lib/admin/chatPhotoActions.ts:303–319`
**Change:** `ninaImageCaption(newId())` is currently spelled inline inside the insert's row literal.
The notification has to carry **the string that is actually in the chat**, and `ninaImageCaption` is
a pure FNV-1a over a *fresh* `newId()` — calling it a second time for the push would notify with one
of the five pool lines that is very likely not the one on the bubble. So it is hoisted into a local
`const` above the insert and the insert reads that `const`.

Reading the body back off the row `insertNinaMessages` returns would also be correct today — the
function projects `messageColumns` and `NinaMessageRow.body` is the `text` column — but it is not
what this phase should do: it makes the notification depend on a projection that has no other reader
here, and it would force the test's shared `insertNinaMessages.mockResolvedValue([{ id: MESSAGE_ID }])`
fixture (used by a dozen existing cases) to grow a field. The local `const` is provably the same
string with no fixture churn, and Step 5 asserts that equality rather than assuming it.

**Code:** the complete replacement for lines 303–322 (the hoist, the insert, and the existing
`message == null` guard, unchanged below the `body:` line):

```ts
  /*
   * Her words for this bubble, minted ONCE and spent twice: the row below is written with this
   * string and the notification further down carries the same one to the lock screen.
   *
   * It is a `const` rather than two calls because `ninaImageCaption` is `pickLine` over a FRESH
   * `newId()` — pure, but not idempotent across calls. A second call for the notification would
   * pick one of `NINA_IMAGE_CAPTION_POOL`'s five lines at random, so four times in five the phone
   * would show a sentence the chat does not contain. It is a `const` rather than a read-back of
   * `message.body` because that would make the notification depend on a projection nothing else
   * here reads, to learn a string this function already knows.
   */
  const body = ninaImageCaption(newId())

  const [message] = await insertNinaMessages(
    userId,
    [
      {
        role: 'nina',
        body,
        source: 'chat',
        turnId: null,
        replyToId: null,
        runId: null,
        /* This bubble is the photograph and nothing else. Remove deletes it with the last picture
         * on it, and from this row forward that no longer depends on what its text says. */
        photoOnly: true,
      },
    ],
    sessionId,
  )
  if (message == null) {
    return { ok: false, error: 'Could not open a place in the conversation for it.' }
  }
```

**Impact:** None at runtime — the same expression, evaluated once instead of once. `newId` and
`ninaImageCaption` are already imported (`:22`, `:26`); no import changes. The header block at
`:238–243` argues `text — ninaImageCaption(newId())` and stays true word for word.

---

### Step 3: Notify, after both rows are in and past every refusal

**File:** `lib/admin/chatPhotoActions.ts:366–369`
**Change:** Insert the notify between `scheduleChatPhotoCaption(userId, image.id)` and
`revalidatePath(ADMIN_CHAT_PHOTOS_PATH)`.

**Why here and nowhere else — the four refusals it must sit past:**

| Guard | Line today | What it wrote |
|---|---|---|
| `pinned == null` — the pre-checked duplicate was removed between the check and the action | `:275–281` | nothing |
| `!isAdminChatPhotoPathname(...)` — the file did not land in her photo folder | `:284–286` | nothing |
| `message == null` — `insertNinaMessages` returned `[]` for a session that is not his | `:320–322` | nothing |
| `image == null` — `insertNinaMessageImages` returned `[]`, and the bubble is **undone** | `:351–355` | a row, then deleted |

The last one is the sharpest: a notification there would announce a message that existed for two
statements. All four are `return`s above this point, so placement past them is the whole of the
guarantee — there is no additional condition to write.

**Why after `scheduleChatPhotoCaption` rather than before it:** `scheduleChatPhotoCaption` is a
synchronous `after()` registration, and the notify is an awaited HTTPS POST to Apple with no timeout
of its own. Registering the deferred captioner *first* means a slow or hung push cannot cost the
photograph its description and its caption. It changes nothing about when the callback runs (`after()`
runs once the response is finished either way) and it keeps the file at exactly one `after()`
callback per add, which is what `tests/admin.chatPhotos.test.ts`'s `runTheAfterCallback()` —
`afterCallbacks.at(-1)` — depends on.

**Why awaited inline and not deferred into its own `after()`:** plan invariant 2 fixes the shape as
`proactive.ts:611–615` — after the commit, inside its own `try`, logging rather than throwing — and
every other phase in this set uses it, so one file diverging would be the one worth reviewing twice.
The cost is one round trip on an action that already awaits a session resolve, two inserts and
possibly a blob release; the `try` makes its failure free; and a second `after()` callback here would
silently break the existing harness's `.at(-1)`.

**Code:** the complete replacement for lines 366–370 (the tail of `addChatPhotoAction`):

```ts
  scheduleChatPhotoCaption(userId, image.id)

  /* ── AND TELL HIS PHONE (nina-push-every-message, R2) ───────────────────────────────────────
   * The header of `scheduleChatPhotoCaption` below says the runner's screen picks a new bubble up
   * "on its next load or service-worker refresh". The refresh half was aspirational: the service
   * worker's `postMessage({type:'nina:new'})` fires only inside its `push` handler, and nothing
   * pushed for a photograph an operator added — so until this line the bubble arrived on the next
   * page load and no sooner. This is the push that makes that sentence true.
   *
   * ── IT IS PAST EVERY REFUSAL, AND THAT IS THE WHOLE GUARD ──────────────────────────────────
   * A vanished pinned row (:275), a file outside her photo folder (:284), an unowned session
   * (:320) and an image that could not be attached (:351) all `return` above this line, and the
   * last of them DELETES the bubble it wrote. There is no fifth condition to test here: reaching
   * this statement is the proof that a message row and an image row are both committed, which is
   * also why it is here rather than beside the insert — a notification that opens a chat showing
   * a caption above an empty frame is worse than no notification.
   *
   * ── `body`, NOT `message.body` ─────────────────────────────────────────────────────────────
   * The same string the row was written with, by construction. See the `const` at :303.
   *
   * ── IT NEVER FAILS THE ADD (plan invariant 2) ──────────────────────────────────────────────
   * `proactive.ts:611-615`'s shape, and `notifyNinaPush` already swallows everything a push can do
   * wrong — no VAPID, no subscriptions, a dead endpoint, a 500 from Apple. This `try` is the belt
   * to that brace: the photograph is in the collection and in the conversation whatever happens
   * next, and an operator must never see "The photo could not be attached" because a phone was
   * unreachable.
   */
  try {
    await notifyNinaPush(userId, [{ id: message.id, body }], 'admin_chat_photo')
  } catch (cause) {
    console.warn('[push] admin chat photo notify failed', {
      userId,
      messageId: message.id,
      imageId: image.id,
      error: String(cause),
    })
  }

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: image.id }
}
```

**Impact:** `addChatPhotoAction`'s response now includes one push fan-out in the common case (a
single indexed `push_subscriptions` read plus 0–2 HTTPS POSTs; `skipped: 'no live subscriptions'`
and a straight return when notifications are off). Its return value, its error strings, its
`revalidatePath` and its `after()` registration are unchanged. The five other actions in the file —
`replaceChatPhotoAction`, `findChatPhotoDuplicateAction`, `removeChatPhotoAction`,
`editChatPhotoDescriptionAction`, `describeChatPhotoAction` — are untouched and mint no message, so
none of them notifies; Step 5 pins that.

---

### Step 4: Mock `@/lib/push/send` in the existing suite

**File:** `tests/admin.chatPhotos.test.ts` — three small edits inside the mocked half of the file
(the half whose header at `:355–370` explains the dynamic-`import()`-after-the-factories shape).

**Change 4a — the handle.** Add one line to the block of loose `vi.fn()`s, after `revalidatePath`
(`:404`):

```ts
const resolveNinaWriteSession = vi.fn()
const revalidatePath = vi.fn()
const notifyNinaPush = vi.fn()
```

**Change 4b — the factory.** Add one `vi.mock` after the `@/lib/nina/blobRelease` one (`:446`):

```ts
/**
 * The push seam. Mocked WHOLESALE rather than spied, for two reasons that both matter here: the
 * real module opens with `import 'server-only'` and pulls in `web-push` and `pushEnv()`, and plan
 * invariant 7 says no test in this set may reach a push service or need a VAPID key.
 *
 * All three of the module's exports are named even though this file only calls one. A `vi.mock`
 * factory REPLACES the module, so a name it omits is missing for every importer in the graph —
 * `lib/nina/proactive.ts` imports `pushNotifier` from here — and that failure surfaces as an
 * unrelated module-resolution error rather than as anything about this test.
 */
vi.mock('@/lib/push/send', () => ({
  notifyNinaPush: (...args: unknown[]) => notifyNinaPush(...args),
  sendNinaPush: vi.fn(),
  pushNotifier: vi.fn(),
}))
```

**Change 4c — the default.** Add one line to `beforeEach`, beside the other resolved defaults
(after `updateNinaChatPhotoDescription.mockResolvedValue({ id: IMAGE_ID })`, `:499`):

```ts
  notifyNinaPush.mockResolvedValue(undefined)
```

**Impact:** `beforeEach` re-establishes the resolved default on every case, so the one case below
that installs `mockRejectedValue` cannot leak into the next. **No `mockResolvedValueOnce` /
`mockRejectedValueOnce` anywhere in this phase's tests** — this file's `afterEach` is
`vi.restoreAllMocks(); vi.clearAllMocks()`, and `clearAllMocks` leaves an unconsumed once-queue
behind to ghost into the following test. The blanket-implementation style above is immune to that,
which is why this phase does **not** churn the shared `afterEach` into `resetAllMocks` — that would
be a drive-by edit to a 1212-line file whose other twelve `describe` blocks depend on its current
semantics.

---

### Step 5: The seven cases

**File:** `tests/admin.chatPhotos.test.ts` — a new `describe` block appended after the
`addChatPhotoAction write-time dedup (media-dedupe P3)` block closes at `:793`, before the
`editChatPhotoDescriptionAction` header comment at `:795`.

**Code:** the complete block.

```ts
/**
 * **The push (nina-push-every-message, R2).** An operator adding a photograph from `/admin` is Nina
 * speaking on her own initiative, and until this phase nothing told the phone: the service-worker
 * refresh this file's own comment names only ever fires inside a `push` handler.
 *
 * The exit criterion has two halves and both are failure-shaped, so both are asserted case by case:
 * an add that LANDED announces exactly the sentence that is in the chat, and an add that returned
 * `{ ok: false }` announces nothing at all. The second half is four cases because the action has
 * four refusals, and the last of them writes a message row and then deletes it — the one place a
 * misplaced call would announce a bubble that no longer exists.
 */
describe('addChatPhotoAction tells his phone (R2)', () => {
  /** A RUNNER-upload pathname: valid for the store and for the schema, refused by the admin guard. */
  const runnerPathname = `nina/${USER}/chat/${ID}-${BLOB_SUFFIX}.jpg`

  it('pushes the bubble it just wrote, with the sentence that is actually in the chat', async () => {
    const result = await actions.addChatPhotoAction(goodBlob)
    expect(result).toEqual({ ok: true, id: IMAGE_ID })

    expect(notifyNinaPush).toHaveBeenCalledTimes(1)

    // The body is not merely "a pool line" — it is THE pool line the insert was given. Asserting
    // the equality rather than the shape is what rules out a second `ninaImageCaption(newId())`
    // call, which would be a legal-looking string and wrong four times in five.
    const [, [inserted]] = insertNinaMessages.mock.calls[0] as [string, [{ body: string }], string]
    expect(notifyNinaPush).toHaveBeenCalledWith(
      USER,
      [{ id: MESSAGE_ID, body: inserted.body }],
      'admin_chat_photo',
    )
    expect(NINA_IMAGE_CAPTIONS).toContain(inserted.body)
  })

  it('announces nothing when the file did not land in her photo folder', async () => {
    const result = await actions.addChatPhotoAction({
      ...goodBlob,
      blobUrl: `${STORE}/${runnerPathname}`,
      pathname: runnerPathname,
    })

    expect(result.ok).toBe(false)
    expect(insertNinaMessages).not.toHaveBeenCalled()
    expect(notifyNinaPush).not.toHaveBeenCalled()
  })

  it('announces nothing when the pinned duplicate has since been removed', async () => {
    getNinaMessageImage.mockResolvedValue(null)

    const result = await actions.addChatPhotoAction({ ...goodBlob, duplicateOfId: 'keep123XYZ_9' })

    expect(result.ok).toBe(false)
    expect(notifyNinaPush).not.toHaveBeenCalled()
  })

  it('announces nothing when no place could be opened in the conversation', async () => {
    // `insertNinaMessages` returns `[]` rather than throwing for a session that is not his.
    insertNinaMessages.mockResolvedValue([])

    const result = await actions.addChatPhotoAction(goodBlob)

    expect(result).toEqual({ ok: false, error: 'Could not open a place in the conversation for it.' })
    expect(notifyNinaPush).not.toHaveBeenCalled()
  })

  it('announces nothing when the picture could not be attached and the bubble was undone', async () => {
    // The sharpest case on this surface: a message row WAS written, then deleted. A notification
    // here would open a chat with nothing in it — the exact defect the empty-bubble unwind exists
    // to prevent, reintroduced through the lock screen.
    insertNinaMessageImages.mockResolvedValue([])
    const { deleteNinaMessage } = await import('@/lib/nina/queries')

    const result = await actions.addChatPhotoAction(goodBlob)

    expect(result).toEqual({ ok: false, error: 'The photo could not be attached to a message.' })
    expect(deleteNinaMessage).toHaveBeenCalledWith(USER, MESSAGE_ID)
    expect(notifyNinaPush).not.toHaveBeenCalled()
  })

  it('a failed push never fails the add, and never costs the photograph its caption', async () => {
    // Plan invariant 2. `notifyNinaPush` is documented as never throwing; this case proves the
    // call site does not depend on that promise being kept.
    notifyNinaPush.mockRejectedValue(new Error('APNs is having a day'))

    const result = await actions.addChatPhotoAction(goodBlob)

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(revalidatePath).toHaveBeenCalledWith(ADMIN_CHAT_PHOTOS_PATH)

    // The captioner was registered BEFORE the push was attempted, so a push that rejects — or one
    // that hangs — cannot take the description and the caption down with it.
    await runTheAfterCallback()
    expect(setNinaMessageImageDescription).toHaveBeenCalledWith(USER, IMAGE_ID, STORED_DESCRIPTION)
    expect(updateNinaMessage).toHaveBeenCalledWith(USER, MESSAGE_ID, CAPTION)
  })

  it('the actions that mint no message announce nothing', async () => {
    // Replace swaps the bytes behind a bubble that already exists and Edit rewrites a paragraph on
    // the photograph; neither is Nina saying anything new, so neither may buzz his phone. ADD is
    // the only writer of a `nina_messages` row on this surface and that is why it is the only site.
    await actions.replaceChatPhotoAction({ id: IMAGE_ID, ...goodBlob })
    await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: 'She is sitting on a kerb in low orange light, a bottle in one hand.',
    })

    expect(notifyNinaPush).not.toHaveBeenCalled()
  })
})
```

**Impact:** Seven new cases, no existing case changed. Every symbol used is already in scope in that
file: `USER`, `ID`, `STORE`, `BLOB_SUFFIX`, `goodBlob`, `MESSAGE_ID`, `IMAGE_ID`,
`STORED_DESCRIPTION`, `CAPTION`, `runTheAfterCallback`, `actions`, the loose `vi.fn()` handles, and
`NINA_IMAGE_CAPTIONS` / `ADMIN_CHAT_PHOTOS_PATH` from the static imports at `:23` and `:15`.

---

## Verification

**Build:** `cd /home/miftah/.worktrees/run-insights/nina-push-every-message && npx tsc --noEmit`
(`vitest` does not typecheck; this is the gate that catches a wrong `notifyNinaPush` signature or a
`kind` literal outside `NinaPushKind`.)

**Lint:** `npm run lint`

**Tests:**

```
npx vitest run tests/admin.chatPhotos.test.ts
npm test
```

The focused run is the phase's own gate; the full `npm test` is the invariant-6 gate, and it must
pass with **no `VAPID_*` in the environment** — the suite never loads `lib/push/send.ts` for real
(invariant 7). If `tests/admin.chatPhotoAdoption.test.ts` or `tests/admin.chatPhotoDedupe.test.ts`
turn red, check whether they import `@/lib/admin/chatPhotoActions` without mocking
`@/lib/push/send`; the fix is the same three-line factory from Step 4b, not a change to the action.

**Manual check:** not reproducible from a preview deployment — memory note
`vercel-preview-cannot-serve-admin` records that `VAPID_*`, `ADMIN_EMAILS` and `AUTH_URL` are
Production-scope only on Vercel, so `/admin` on a preview cannot both authorize and push. Verify
from a local production build with `.env.local`, or after a production deploy: with the PWA installed
on the XS Max and notifications on, add a photo on `/admin/photos` and watch for one notification
titled "Nina" whose body is one of `NINA_IMAGE_CAPTION_POOL`'s lines, and for the tap to land on
`/nina` with the picture already in the bubble. With notifications off, the add must behave exactly
as it does today and the server log must read `skipped: 'no live subscriptions'`.

**Exit criteria:**

1. `addChatPhotoAction` calls the phase-1 notifier exactly once on success, with the message id it
   just inserted and the identical caption string that row carries.
2. All four of its `{ ok: false }` returns call it zero times — including the one that writes a
   message row and deletes it again.
3. A rejecting notifier leaves the return value, the `revalidatePath` and the deferred caption pass
   untouched.
4. No other action in `lib/admin/chatPhotoActions.ts` notifies.
5. `npx tsc --noEmit`, `npm run lint` and `npm test` are green with no `VAPID_*` set.

## Handoffs

- **The pool line versus the real caption.** The push carries the placeholder
  (`nih`, `nih, puas?`, `foto gw. jangan di-zoom`, …) because the real caption is written ~20 s later
  by `scheduleChatPhotoCaption`'s `after()` callback. Notifying from inside that callback instead
  would put a truer sentence on the lock screen and would delay the buzz by two model calls
  (~15–37 s) — and would break this file's harness, which resolves `after()` callbacks by
  `afterCallbacks.at(-1)`. The phase scope pins the call to the action body ("after the photo bubble
  AND its `nina_message_images` row are written"), so the placeholder is the shipped behaviour. Worth
  its own card if the runner reports the notification text as unhelpful; **not** worth a second push.
- **`removeChatPhotoAction` silently deleting a bubble the phone already announced** is out of scope
  and is not a defect this set introduces — the tray tag is the single constant `'nina'`, so the next
  notification replaces it, and the notification is a knock on the door rather than a record.
- **R1's four sites** — `lib/nina/turnrun.ts` (Phase 2), `lib/nina/imagerun.ts` and
  `lib/nina/imagejobs.ts` (Phase 3), `scripts/nina-image-worker/finish.ts` (Phase 5). This phase
  serves R2 only and touches none of them.
- **Phase 1's vocabulary — settled, nothing to do.** `phase-1.md`'s `NINA_PUSH_KINDS` carries
  `'admin_chat_photo'` for exactly this origin, stamped by exactly this file. If a *future*
  requirement needs a kind this union does not have, adding one is phase 1's file
  (`lib/push/payload.ts`) and not this phase's.

## Rollback

`git revert` the phase's single commit. Nothing else depends on it: no export is added or removed,
no signature changes, no schema, no migration, no wire-format change (`NinaPushPayload.v` stays `1`),
and the only cross-module edge introduced is one import of a phase-1 symbol. Reverting restores
`ninaImageCaption(newId())` to its inline position and `addChatPhotoAction` to a function that writes
two rows and tells nobody. Phases 2, 3 and 5 are unaffected in either direction.

A revert-free way to silence it in production: turn notifications off on `/me`, which revokes the
subscription and makes this call site return `skipped: 'no live subscriptions'` before it touches
anything.
