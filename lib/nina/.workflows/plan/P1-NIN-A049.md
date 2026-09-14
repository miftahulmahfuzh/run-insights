> Adopted from `NINA_PUSH_EVERY_MESSAGE_PLAN.md` phase 3. Source: `.workflows/plan/nina-push-every-message/phase-3.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 3: Push when the photo lands, and when it cannot

**Plan set:** `NINA_PUSH_EVERY_MESSAGE_PLAN.md`
**Analysis:** `20260914-102749-C7K2_code_analyzer.md`
**Satisfies:** R1 — *when Nina answers something the runner said, a push notification is sent*. The
photograph he asked for ninety seconds ago, and her apology when it never came, are both answers to
something he said.
**Depends on:** Phase 1 (`lib/push/send.ts`'s `notifyNinaPush` + `lib/push/payload.ts`'s
`NinaPushKind`, members `'photo_delivered'` and `'photo_apology'`)
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

After this phase, the two message writes on the image path buzz the phone. `finishSelfie` sends a
push once the photograph's `nina_messages` row **and** its `nina_message_images` row are both
committed and the job is closed `ok`, so a tap opens a chat with a picture in it. And
`postNinaApologyMessage` — the single helper both `failNinaImageJob` and `sweepStaleNinaImageJobs`
reach — sends one once R22's apology row lands, inheriting that helper's existing callers' gates so
an **avatar** job and a **hidden** (`deletedAt != null`) job still push nothing. Neither call can
fail, delay, reopen or cost a job: each is in its own `try` and logs.

---

## Interface Contract

**Deletes:** none
**Renames:** none
**Creates:** `tests/nina.imagepush.test.ts` (new test file). **No new exported symbol.**
`postNinaApologyMessage` stays module-local exactly as the 2026-09-12 YAGNI sweep left it.

**Signature changes:** none. `finishSelfie` and `postNinaApologyMessage` keep their parameter lists
and their `Promise<void>` returns. The only shape change is internal: `postNinaApologyMessage` now
binds `insertNinaMessages`' returned row (`const [apology] = await …`) instead of discarding it,
because the notification needs the id it writes.

**Requires (from earlier phases) — SETTLED against `phase-1.md`, not assumed:**

| What this phase imports | Name | From |
|---|---|---|
| the never-throwing notify function | `notifyNinaPush(userId, messages, kind)` | `@/lib/push/send` |
| the delivered photograph's kind | `'photo_delivered'` | `NinaPushKind` in `lib/push/payload.ts` |
| the apology's kind | `'photo_apology'` | `NinaPushKind` in `lib/push/payload.ts` |

**These two kinds are the IN-PLATFORM host's, and phase 5's `'worker_photo_delivered'` /
`'worker_photo_apology'` are the off-platform host's for the same two events. That is deliberate,
not drift.** `NinaPushPayload.kind` is documented as diagnostics only, and "which host delivered
this photograph" is exactly the diagnostic the GitHub-Actions backstop exists to produce: it only
runs when this app's own invocation was killed, so a `worker_*` line in a log is the signal that
the backstop fired. Collapsing the pairs into one value each would destroy the only signal that
says so. **Do not "tidy" this phase's literals to match phase 5's, or the reverse.**

A literal outside the union cannot land silently: `notifyNinaPush`'s `kind` parameter is typed
`NinaPushKind`, so a wrong spelling is a `tsc --noEmit` error at the call site on the first gate
run. Do not widen the parameter to `string` to make one compile.

Phase 1's signature, restated so a mismatch is obvious:

```ts
export function notifyNinaPush(
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
): Promise<void>
```

**Leaves alone (owned by others):**
- `lib/nina/turnrun.ts` — Phase 2
- `lib/nina/proactive.ts` — untouched by construction (plan invariant 1); this phase reads it as the
  pattern and copies the shape at `proactive.ts:702–706`, it does not edit it
- `lib/admin/**` — Phase 4
- `scripts/**` and `.github/**` — Phase 5. In particular
  `scripts/nina-image-worker/finish.ts` writes the SAME photograph message off-platform under that
  directory's module rules; it is phase 5's site, not a second site of mine
- `lib/push/**` — Phase 1
- `lib/nina/imagefail.ts`, `lib/nina/sessionResolve.ts`, `lib/nina/queries/**` — read, never edited

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagerun.ts` | modify | one import (`:9`); one `try`-wrapped notify at the end of `finishSelfie` (after `:463`) |
| `lib/nina/imagejobs.ts` | modify | one import (`:7`); bind the inserted apology row and one `try`-wrapped notify inside `postNinaApologyMessage` (`:612–633`) |
| `tests/nina.imagerun.test.ts` | modify | mock `@/lib/push/send`; reset it in `beforeEach`; one new `describe` block of four cases |
| `tests/nina.imagepush.test.ts` | create | drives the REAL `imagejobs.ts` over `installFakeDb` through both apology callers |

Four files, as the plan index's Phase 3 row now says (the index's draft said 3; the reconciler
corrected it to count the new test file). No source file beyond the two named is touched.

---

## Implementation Steps

### Step 1: Import the notifier into `lib/nina/imagerun.ts`

**File:** `lib/nina/imagerun.ts:8–9`
**Change:** Add one line to the `@/lib/*` import group. That group today is `@/lib/env`,
`@/lib/id`, `@/lib/photos/contentHash` on lines 6–8, followed by a blank line and the relative
`./…` group. `@/lib/push/send` sorts after `@/lib/photos/contentHash`, so it becomes line 9 and the
blank line moves down by one.

**Code (the import block as it must read, lines 1–17 verbatim, unchanged except the one added line):**

```ts
import 'server-only'

import { put } from '@vercel/blob'
import { after } from 'next/server'

import { blobEnv } from '@/lib/env'
import { newId } from '@/lib/id'
import { contentHashOf } from '@/lib/photos/contentHash'
import { notifyNinaPush } from '@/lib/push/send'

import { releaseBlobIfUnreferenced } from './blobRelease'
import { captionNinaPhoto } from './caption'
import { logNinaError } from './errorlogs'
import { callNinaImageModel, type NinaImageCallResult } from './imagecall'
import { planNinaImageWrite, type NinaImageDedupHit } from './imageDedupe'
import { ninaImageCaption, type NinaImageFailure } from './imagefail'
import { signImageBytes, type NinaImageSignature } from './perceptualSign'
```

**Impact:** `lib/push/send.ts` (and through it `web-push`, `@/lib/env` and `lib/push/queries.ts`)
joins this module's import graph. That is already proven safe under vitest: `lib/nina/proactive.ts`
imports the same module today and `tests/nina.proactive.test.ts` mocks nothing at all. `send.ts`'s
only import of `lib/nina/proactive.ts` is `import type`, erased by the compiler, so no runtime
require-cycle is created — that file's own header forbids turning it into a value import, and this
phase does not.

---

### Step 2: Notify after the photograph is delivered

**File:** `lib/nina/imagerun.ts:450–464` — the tail of `finishSelfie`, replacing lines 453–464
(the blob-release block through the closing brace).

**Change:** append the notify after `completeNinaImageJob`.

**Why the very end and not immediately after `insertNinaMessageImages` — SETTLED, do not re-open.**
The reconciler accepted this placement on the rung of this phase's own exit criterion, *"a notify
failure never fails or reopens a job"*: the earlier position is the one that can reopen one. The
reasoning below is the record of why, and it is the placement the implementer ships. The phase brief
requires
the call to sit after both rows and after the post-insert dedupe re-check; all three of those are
satisfied anywhere below line 450. The tie-breaker is this function's own "THE ORDER IS LOAD-BEARING"
docstring: *"A crash between the two leaves a `pending` job whose photo is already in the chat, which
a sweep will eventually apologise for."* `notifyNinaPush` awaits a VAPID-signed HTTPS POST to Apple
for every live subscription. Putting that between the image row and `completeNinaImageJob` would
insert seconds of network into the window where the job is still `pending` — inside an `after()`
callback bounded by `NINA_IMAGE_RUN_BUDGET_MS`, an instance killed during those seconds leaves a job
that a later `sweepStaleNinaImageJobs` apologises for **on top of** a photograph that is already in
the chat, and (after step 4) pushes that apology too. Placed last, the worst a push can cost is the
push. The bubble and the image row are committed, the ledger is closed, nothing downstream depends
on this line.

**Code (complete replacement for lines 453–464; everything above line 453 in `finishSelfie` is
unchanged):**

```ts
  /* Loser bytes out — only after the row that pointed at them is in, and only when the plan says
   * there ARE loser bytes: the skip path referenced the keeper without ever putting, so there is
   * nothing of ours in the store at all. */
  if (writePlan.release != null) {
    const outcome = await releaseBlobIfUnreferenced(userId, writePlan.release)
    if (outcome !== 'deleted') {
      console.warn('[nina] dedup loser kept in the store', { jobId, outcome, bytes: image.bytes })
    }
  }

  await completeNinaImageJob(userId, jobId, result)

  /*
   * ── THE KNOCK ON THE DOOR (R1) ────────────────────────────────────────────────────────────
   * He asked for this photograph ninety seconds ago and has certainly locked his phone — that is
   * what the whole `after()` design is FOR. Until this line the only way he learned the picture
   * had arrived was opening `/nina` and looking.
   *
   * ── WHY IT IS THE LAST STATEMENT IN THE FUNCTION ──────────────────────────────────────────
   * Every reason "THE ORDER IS LOAD-BEARING" gives above applies harder to a network call. This
   * awaits a signed HTTPS POST per live subscription; placed before `completeNinaImageJob` it
   * would widen the window in which this job is still `pending` while its photograph is already
   * in the chat — and an instance killed inside that window hands `sweepStaleNinaImageJobs` a job
   * to apologise for that nobody needs an apology about. Placed here, the most a push can cost is
   * the push. Both rows are committed, the dedup re-check has had its say, the ledger is closed.
   *
   * ── WHY THE BODY IS `caption` AND NOT `message.body` ──────────────────────────────────────
   * They are the same string by construction — `insertNinaMessages` writes `text: row.body` from
   * exactly this value — but `caption` is the one this process computed and proved non-empty at
   * the insert above ("Never empty", and both halves of that expression are non-empty strings).
   * Reading it back off the returned row would make the notification's body depend on a column
   * round-trip for no gain. `message.id` is the row's, because a notification's `messageId` must
   * name a row that exists.
   *
   * ── ITS OWN `try`, AND IT SWALLOWS (PLAN INVARIANT 2) ─────────────────────────────────────
   * The exact shape of `lib/nina/proactive.ts:702–706`. `notifyNinaPush` already never throws on
   * its own account — a deployment with no `VAPID_*` is reported as `skipped`, not raised — so
   * reaching this catch means a bug or a database fault in the push bookkeeping. Neither is worth
   * a photograph: the job is already `ok`, the bubble is already in the chat, and throwing here
   * would make `runNinaImageJob` close a delivered generation as a failure.
   */
  try {
    await notifyNinaPush(userId, [{ id: message.id, body: caption }], 'photo_delivered')
  } catch (cause) {
    console.warn('[nina] photo notify failed', { jobId, error: String(cause) })
  }
}
```

**Impact:** A delivered selfie now sends exactly one push carrying its caption. `finishAvatar`
(`lib/nina/imagerun.ts:481`) is a different function and is deliberately untouched — an avatar
generation writes no `nina_messages` row at all (*"No `nina_messages` row: nobody asked in chat"*),
so there is nothing to notify about and the `avatar_changed` proactive trigger, which already
pushes through `proactive.ts`, is the only correct announcement for it.

`message` is in scope and non-nullable here: line 375's `if (message == null) throw` narrows it for
the rest of the function. `caption` is in scope as a `string` from line ~349.

---

### Step 3: Import the notifier into `lib/nina/imagejobs.ts`

**File:** `lib/nina/imagejobs.ts:5–8`
**Change:** add one line to the `@/lib/*` group, which today is `@/lib/db` (line 5),
`@/lib/db/schema` (6) and `type … from '@/lib/db/schema'` (7). `@/lib/push/send` sorts after them.

**Code (the import block as it must read, lines 1–23 verbatim, unchanged except the one added line):**

```ts
import 'server-only'

import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns } from '@/lib/db/schema'
import type { NinaTurnStatus } from '@/lib/db/schema'
import { notifyNinaPush } from '@/lib/push/send'

import { ninaImageApology, type NinaImageFailure } from './imagefail'
import {
  jakartaDayStart,
  ninaImageDailyCap,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_STALE_MS,
  type NinaImageJobArgs,
  type NinaImageJobPhase,
  type NinaImagePurpose,
} from './imagerecipe'
import { coerceNinaImageModel } from './imageprefs'
import type { NinaJobRefusal } from './jobview'
import { countNinaTurnsSince, insertNinaMessages, insertNinaTurn } from './queries'
import { resolveNinaSessionForMessage } from './sessionResolve'
```

**Impact:** `lib/push/send.ts` joins this module's graph, and therefore the graph of every test that
runs `imagejobs.ts` for real — `tests/nina.softDelete.test.ts`, `tests/nina.jobActions.test.ts`,
`tests/admin.imageGenActions.test.ts`. **Measured, not assumed:** vitest does not load `.env.local`
(`vitest.config.ts` has no dotenv step and `tests/support/setup.ts` seeds only `DATABASE_URL` and the
seven LLM/blob dummies). A probe test asserting `process.env.VAPID_PUBLIC_KEY != null` came back
`false` in this worktree even though `.env.local` holds three `VAPID_*` lines. So in every suite
`configureVapid()` throws inside `sendNinaPush`'s own `try` and it returns
`skipped: 'VAPID not configured: …'` **before** `listLivePushSubscriptions` — no database statement,
no network, nothing enqueued off a `FakeDb` queue and nothing added to `fake.queries`. The existing
`toHaveLength(1)` / `toHaveLength(2)` assertions in `tests/nina.softDelete.test.ts` therefore keep
holding unchanged (they also never reach the apology helper: their cases are `purpose: 'avatar'` or
`deletedAt` set). Plan invariant 7 is satisfied structurally, and the new suite in step 5 mocks
`@/lib/push/send` outright so it does not depend on that.

---

### Step 4: Notify after the apology row lands

**File:** `lib/nina/imagejobs.ts:612–633` — the whole of `postNinaApologyMessage`, replaced.

**Change:** hoist the apology text into a `const`, bind `insertNinaMessages`' returned row, and
notify in its own `try`.

**Why this helper and not its two callers.** `failNinaImageJob` (`:575`) and
`sweepStaleNinaImageJobs` (`:718`) each already decide whether an apology is owed, and they decide it
the same way for the same reasons: `purpose === 'selfie' && closed?.deletedAt == null` in the first,
`args?.purpose !== 'avatar' && closed[0]!.deletedAt == null` in the second. **Both of those gates are
exactly the gate the notification needs** — an avatar job has no pending bubble because nobody asked
for one in the chat, and a hidden job (R2) gets no sentence at all. Putting the notify inside the
helper inherits both gates by construction rather than restating either: one site, two callers, and
**no second copy of a rule that can drift.** A notify written in the callers would be that copy, in
duplicate.

**Code (complete replacement for `postNinaApologyMessage`; the docstring above it at lines 585–611
is unchanged and stays exactly where it is):**

```ts
async function postNinaApologyMessage(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  replyToId: string | null
}): Promise<void> {
  const sessionId = await resolveNinaSessionForMessage(input.userId, input.replyToId)

  /* Hoisted out of the insert so the row and the notification below say the same sentence by
   * construction rather than by calling a deterministic function twice and trusting it. */
  const body = ninaImageApology(input.kind, input.jobId)

  const [apology] = await insertNinaMessages(
    input.userId,
    [
      {
        role: 'nina',
        body,
        source: 'chat',
        turnId: input.jobId,
        replyToId: input.replyToId,
      },
    ],
    sessionId,
  )

  /*
   * ── R1: TWENTY MINUTES IS A LONG TIME TO WAIT FOR A PHOTO THAT IS NOT COMING ──────────────
   * One site here covers BOTH callers — `failNinaImageJob`'s terminal give-up and
   * `sweepStaleNinaImageJobs`' 20-minute deadline — and, more importantly, it inherits their two
   * gates instead of restating them. Neither caller reaches this function for an AVATAR job
   * (nobody asked for one in the chat, so there is nothing to apologise for and nothing to
   * announce) nor for a job the runner has HIDDEN (`deleted_at` read off each caller's own
   * `returning`, which is R2's whole point). A notification written in the callers would be a
   * second copy of both rules, in duplicate, free to drift.
   *
   * ── WHY THE ROW IS BOUND AND NOT DISCARDED ────────────────────────────────────────────────
   * `insertNinaMessages` returns `[]` rather than throwing when the session is not this user's —
   * its documented convention — so an empty result means NO ROW WAS WRITTEN. Notifying then would
   * buzz a phone about a message that does not exist, which is strictly worse than silence. The
   * id is also what `NinaPushPayload.messageId` carries, and that field must name a real row.
   *
   * ── ITS OWN `try`, AND IT IS LOAD-BEARING IN BOTH CALLERS ─────────────────────────────────
   * The shape of `lib/nina/proactive.ts:702–706`, and here the swallow buys two specific things
   * beyond invariant 2's general rule. `failNinaImageJob` wraps its call to this function in a
   * catch that logs *"image apology could not be written; closing the job anyway"* — a notify
   * failure escaping to there would file itself under a message that DID get written. And
   * `sweepStaleNinaImageJobs` wraps its call in a per-row try whose `swept += 1` sits AFTER it,
   * so an escaping notify failure would under-count the sweep and log a job that was in fact
   * closed as one that failed to close.
   */
  if (apology != null) {
    try {
      await notifyNinaPush(input.userId, [{ id: apology.id, body }], 'photo_apology')
    } catch (cause) {
      console.warn('[nina] apology notify failed', { jobId: input.jobId, error: String(cause) })
    }
  }
}
```

**Impact:** A failed or swept selfie job now sends exactly one push carrying her apology. An avatar
job and a hidden job still send nothing, because neither reaches this function. `failNinaImageJob`'s
terminal `UPDATE` and `sweepStaleNinaImageJobs`' count are both untouched.

---

### Step 5: Tests

Two files: an extension to the existing `finishSelfie` suite, and a new suite for the apology,
because the two sites are driven through completely different harnesses. `tests/nina.imagerun.test.ts`
mocks `@/lib/nina/imagejobs` wholesale and drives `finishSelfie` through `runNinaImageJob`, which is
its only door; the apology lives *inside* that mocked module, so it cannot be reached from there at
all. `tests/nina.softDelete.test.ts` runs `imagejobs.ts` for real over `installFakeDb`, but it
deliberately steers **around** the apology plumbing (its own comment: *"`purpose: 'avatar'` sidesteps
the apology plumbing … so this test can isolate the ONE thing this file changed"*) and asserts exact
`fake.queries` lengths that a suite adding message inserts would have to fight. A third file is the
repo's own answer — the same reasoning `nina.softDelete.test.ts`'s header gives for not living in
`nina.jobActions.test.ts`.

#### Step 5a: `tests/nina.imagerun.test.ts` — the delivered photograph

**File:** `tests/nina.imagerun.test.ts`

**Change 1 — the mock.** After the existing `vi.mock('@/lib/nina/sessionResolve', …)` on line 71,
add one line:

```ts
/* All three of the module's runtime exports are named, even though this file calls one. A
 * `vi.mock` factory REPLACES the module, so a name it omits is missing for every importer in the
 * graph — `lib/nina/proactive.ts` imports `pushNotifier` from here — and that surfaces as an
 * unrelated module-resolution error rather than as anything about this test. Phases 2 and 4 write
 * the same three-key factory for the same reason; one shape across the set. */
vi.mock('@/lib/push/send', () => ({
  notifyNinaPush: vi.fn(),
  pushNotifier: vi.fn(),
  sendNinaPush: vi.fn(),
}))
```

**Change 2 — the import.** Add to the import block (after the `@/lib/nina/*` imports, line 20's
`NINA_TUNING_DEFAULTS` group, keeping `@/lib/push/send` after `@/lib/nina/tuning`):

```ts
import { notifyNinaPush } from '@/lib/push/send'
```

**Change 3 — the handle.** After line 83's `const writeSession = vi.mocked(resolveNinaWriteSession)`:

```ts
const notify = vi.mocked(notifyNinaPush)
```

**Change 4 — reset it in `beforeEach`.** This file uses `vi.clearAllMocks()`, which clears recorded
calls but **not** implementations, so one case's `mockRejectedValue` would leak into the next. Every
other mock in this `beforeEach` is re-set for exactly that reason; `notify` needs the same line. Add
it beside `releaseLoser.mockResolvedValue('deleted')` at line 129:

```ts
  notify.mockResolvedValue(undefined)
```

**Change 5 — the new block**, appended after the existing `describe('write-time dedup (media-dedupe
P3)', …)` block that ends at line 321:

```ts
/**
 * **R1: the photograph knocks on the door.**
 *
 * `runNinaBackgroundTurn`'s sibling problem, in the one place it bites hardest. He asked for this
 * picture ninety seconds ago and the whole `after()` design exists so he can put the phone down;
 * until this phase the only way he learned it had arrived was opening `/nina` and looking.
 *
 * `@/lib/push/send` is mocked rather than left real, even though the real `sendNinaPush` is inert
 * with no `VAPID_*` in the environment (it catches `pushEnv()` and reports `skipped` before
 * touching a database). Mocking it is what lets these cases assert the ARGUMENTS — which body,
 * which id, which kind — and it is plan invariant 7 held by construction rather than by an
 * environment variable staying unset.
 */
describe('the delivered photograph buzzes the phone', () => {
  it('sends exactly one push carrying the caption and the row that was written', async () => {
    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(USER, [{ id: 'msg-1', body: 'nih, di pantai' }], 'photo_delivered')
  })

  it('pushes the canned fallback line when the caption call was refused', async () => {
    /* Whatever landed in the bubble is what the lock screen says — the notification is never
     * assembled from a second source. */
    caption.mockResolvedValue(null)

    await runNinaImageJob(USER, JOB_ID)

    expect(notify).toHaveBeenCalledWith(
      USER,
      [{ id: 'msg-1', body: ninaImageCaption(JOB_ID) }],
      'photo_delivered',
    )
  })

  it('a notify failure never costs the photograph, the image row or the closed job', async () => {
    /* Plan invariant 2. `notifyNinaPush` never throws on its own account, so reaching the catch is
     * a bug or a bookkeeping fault — and neither is worth a generation that has already been paid
     * for, stored and captioned. */
    notify.mockRejectedValue(new Error('push: bookkeeping failed'))

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(insertMessages).toHaveBeenCalled()
    expect(insertImages).toHaveBeenCalled()
    expect(complete).toHaveBeenCalled()
  })

  it('an avatar generation pushes nothing: no bubble was written, so there is nothing to announce', async () => {
    /* `finishAvatar` writes no `nina_messages` row at all — "nobody asked in chat", and the
     * `avatar_changed` proactive trigger is what mentions it later, through `proactive.ts`'s own
     * notify. A push from here would be Nina announcing something the runner never requested. */
    claim.mockResolvedValue({ args: { ...ARGS, purpose: 'avatar' }, attempts: 1 } as never)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(insertAvatar).toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
```

`ninaImageCaption` is already imported at line 8 and already deliberately left unmocked (*"the
fallback assertions are only worth anything if they compare against the real deterministic draw"*),
so the second case compares against the real line for the real job id.

#### Step 5b: `tests/nina.imagepush.test.ts` — the apology, from both callers

**File:** `tests/nina.imagepush.test.ts` (new)

**Code (complete file):**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ninaImageApology } from '@/lib/nina/imagefail'
import { insertNinaMessages } from '@/lib/nina/queries'
import { resolveNinaSessionForMessage } from '@/lib/nina/sessionResolve'
import { notifyNinaPush } from '@/lib/push/send'
import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **R1's second half: the apology buzzes the phone too.**
 *
 * Twenty minutes is a long time to wait for a photograph that is not coming, and until this phase
 * R22's sentence reached the runner only if he happened to open `/nina`. The notification lives in
 * `postNinaApologyMessage`, which is module-private and is reached from BOTH terminal paths —
 * `failNinaImageJob` (the give-up, when the retry budget is spent) and `sweepStaleNinaImageJobs`
 * (the 20-minute deadline). One site, two callers, and — the reason it is in the helper at all —
 * **both callers' gates inherited rather than restated**: an avatar job never reaches it, and
 * neither does a job the runner hid.
 *
 * ── WHY A THIRD FILE, AND NOT ONE OF THE TWO NEIGHBOURS ──────────────────────────────────────
 *   · `tests/nina.imagerun.test.ts` mocks `@/lib/nina/imagejobs` wholesale, so the helper under
 *     test here does not exist in that file's module graph at all.
 *   · `tests/nina.softDelete.test.ts` runs `imagejobs.ts` for real, but its whole method is
 *     counting `fake.queries` — and its own comment records that it uses `purpose: 'avatar'`
 *     precisely to *sidestep* the apology plumbing. Adding message inserts to that file would
 *     fight every length assertion in it. That file's header gives this same reasoning for not
 *     living inside `tests/nina.jobActions.test.ts`; this is the next rung of it.
 *
 * ── THE HARNESS ───────────────────────────────────────────────────────────────────────────────
 * `installFakeDb()` for `imagejobs.ts`'s own two statements (the terminal `UPDATE … RETURNING` and
 * the sweep's `SELECT`), because those are real drizzle SQL and the module builds them itself.
 * Everything past the job row is mocked at the module boundary: `@/lib/nina/queries` (Neon),
 * `@/lib/nina/sessionResolve` (Neon), and `@/lib/push/send` — the last so these cases can assert
 * the arguments, and so plan invariant 7 holds by construction rather than because nobody
 * remembered to set `VAPID_*`.
 *
 * `vi.resetAllMocks()` and not `clearAllMocks`: `clearAllMocks` leaves implementations and any
 * unconsumed `mockResolvedValueOnce` in place, so one failing case's queue ghosts into the next.
 */

vi.mock('@/lib/nina/queries', () => ({
  countNinaTurnsSince: vi.fn(),
  insertNinaMessages: vi.fn(),
  insertNinaTurn: vi.fn(),
}))
vi.mock('@/lib/nina/sessionResolve', () => ({ resolveNinaSessionForMessage: vi.fn() }))
/* All three runtime exports, not just the one this file calls: a factory REPLACES the module for
 * every importer in the graph, and an omitted name fails as a module-resolution error somewhere
 * else entirely. Phases 2 and 4 write the same three keys. */
vi.mock('@/lib/push/send', () => ({
  notifyNinaPush: vi.fn(),
  pushNotifier: vi.fn(),
  sendNinaPush: vi.fn(),
}))

type ImageJobs = typeof import('@/lib/nina/imagejobs')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const JOB = 'jobAAAAAAAAA'
const USER = 'u1'
const SESSION = 'sessionAAAAA'
const APOLOGY_ID = 'msgAAAAAAAAA'
const ASKED = 'askedAAAAAAA'

const insertMessages = vi.mocked(insertNinaMessages)
const resolveSession = vi.mocked(resolveNinaSessionForMessage)
const notify = vi.mocked(notifyNinaPush)

let fake: FakeDb
let jobs: ImageJobs

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  fake = installFakeDb()
  resolveSession.mockResolvedValue(SESSION)
  insertMessages.mockResolvedValue([{ id: APOLOGY_ID }] as never)
  notify.mockResolvedValue(undefined)
  jobs = await import('@/lib/nina/imagejobs')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/** `args` as the sweep's SELECT hands them back — a jsonb column, so one value, not a row. */
function selfieArgs(overrides: Record<string, unknown> = {}) {
  return { purpose: 'selfie', prompt: 'p', seed: 1, replyToId: ASKED, ...overrides }
}

describe('failNinaImageJob — the give-up apologises AND buzzes', () => {
  it('sends one push carrying her apology, verbatim, for a visible selfie job', async () => {
    fake.enqueue([[null]]) // the UPDATE...RETURNING: deletedAt is null — never hidden

    await jobs.failNinaImageJob({
      userId: USER,
      jobId: JOB,
      kind: 'timeout',
      purpose: 'selfie',
      replyToId: ASKED,
    })

    const body = ninaImageApology('timeout', JOB)
    /* The row and the notification say the same sentence because the function computes it once —
     * asserted against the real deterministic draw, not against a spy's own argument. */
    expect(insertMessages.mock.calls[0]?.[1][0]?.body).toBe(body)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(USER, [{ id: APOLOGY_ID, body }], 'photo_apology')
  })

  it('pushes nothing for an AVATAR job — nobody asked for one in the chat', async () => {
    fake.enqueue([[null]])

    await jobs.failNinaImageJob({ userId: USER, jobId: JOB, kind: 'policy', purpose: 'avatar' })

    /* The gate is inherited, not restated: the caller never reaches the helper, so there is
     * neither an apology nor a notification, and that is one decision rather than two. */
    expect(insertMessages).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('pushes nothing for a job the runner hid mid-flight (R2)', async () => {
    fake.enqueue([['2026-09-13 00:05:00+00']]) // the UPDATE...RETURNING: deletedAt is set

    await jobs.failNinaImageJob({
      userId: USER,
      jobId: JOB,
      kind: 'timeout',
      purpose: 'selfie',
      replyToId: ASKED,
    })

    /* A sentence in a chat he had just tidied away would be bad; a notification about it would be
     * worse — it reaches a locked phone. Same gate, same answer. */
    expect(insertMessages).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('a notify failure never fails the job, reopens it, or loses the apology row', async () => {
    fake.enqueue([[null]])
    notify.mockRejectedValue(new Error('push: bookkeeping failed'))

    await expect(
      jobs.failNinaImageJob({
        userId: USER,
        jobId: JOB,
        kind: 'timeout',
        purpose: 'selfie',
        replyToId: ASKED,
      }),
    ).resolves.toBeUndefined()

    /* The terminal UPDATE ran, the apology landed, and nothing was re-attempted. Plan invariant 2:
     * the push is the only thing a push failure is allowed to cost. */
    expect(fake.queries).toHaveLength(1)
    expect(fake.only().sql).toMatch(/^update "nina_turns" set/)
    expect(insertMessages).toHaveBeenCalledTimes(1)
  })

  it('pushes nothing when the insert wrote no row at all', async () => {
    /* `insertNinaMessages` returns `[]` rather than throwing for a session that is not his. No row
     * means no message, and a notification about a message that does not exist is the worst
     * outcome available here. */
    fake.enqueue([[null]])
    insertMessages.mockResolvedValue([] as never)

    await jobs.failNinaImageJob({
      userId: USER,
      jobId: JOB,
      kind: 'timeout',
      purpose: 'selfie',
      replyToId: ASKED,
    })

    expect(notify).not.toHaveBeenCalled()
  })
})

describe('sweepStaleNinaImageJobs — the 20-minute deadline buzzes through the same helper', () => {
  it('sends one push for a swept visible selfie job', async () => {
    fake.enqueue([[JOB, selfieArgs()]]) // the SELECT
    fake.enqueue([[JOB, null]]) // the UPDATE...RETURNING: deletedAt is null

    await expect(jobs.sweepStaleNinaImageJobs(USER)).resolves.toBe(1)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      USER,
      [{ id: APOLOGY_ID, body: ninaImageApology('stale', JOB) }],
      'photo_apology',
    )
  })

  it('pushes nothing for a swept HIDDEN job, matching the apology it already withholds', async () => {
    fake.enqueue([[JOB, selfieArgs()]])
    fake.enqueue([[JOB, '2026-09-13 00:20:00+00']]) // still hidden

    await expect(jobs.sweepStaleNinaImageJobs(USER)).resolves.toBe(1)

    expect(insertMessages).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('pushes nothing for a swept AVATAR job', async () => {
    fake.enqueue([[JOB, selfieArgs({ purpose: 'avatar', replyToId: null })]])
    fake.enqueue([[JOB, null]])

    await expect(jobs.sweepStaleNinaImageJobs(USER)).resolves.toBe(1)

    expect(notify).not.toHaveBeenCalled()
  })

  it('a notify failure still counts the job as swept', async () => {
    /* The reason the `try` is INSIDE the helper and not left to the caller's. The sweep's per-row
     * catch sits around this call and `swept += 1` sits AFTER it, so an escaping notify failure
     * would under-count the sweep and log a job that was in fact closed as one that failed to
     * close. */
    fake.enqueue([[JOB, selfieArgs()]])
    fake.enqueue([[JOB, null]])
    notify.mockRejectedValue(new Error('push: bookkeeping failed'))

    await expect(jobs.sweepStaleNinaImageJobs(USER)).resolves.toBe(1)

    expect(insertMessages).toHaveBeenCalledTimes(1)
  })
})
```

**Impact:** nine new cases across two files. Nothing in the existing suites changes behaviour except
the one `notify.mockResolvedValue(undefined)` line added to `tests/nina.imagerun.test.ts`'s
`beforeEach`.

---

## Verification

Run every command from the worktree root
`/home/miftah/.worktrees/run-insights/nina-push-every-message`, which already has `.env.local` and a
real `npm install`.

**Build / typecheck:** `npm run typecheck`
(`next typegen && tsc --noEmit`. Use the script, not a bare `npx tsc --noEmit`: without typegen the
`PageProps` helper types are missing and app routes error for an unrelated reason. `vitest` does not
typecheck, so this is the gate that catches a wrong `NinaPushKind` literal.)

**Lint:** `npm run lint`

**Tests, targeted first:**

```
npx vitest run tests/nina.imagerun.test.ts tests/nina.imagepush.test.ts \
               tests/nina.imagelog.test.ts tests/nina.softDelete.test.ts \
               tests/nina.jobActions.test.ts tests/admin.imageGenActions.test.ts
```

The last four are the suites whose module graph this phase widens; they must stay green untouched.

**Tests, full:** `npm test`
A red in `tests/nina.chatPhoto*.test.ts` or `components/**` that also reproduces on clean `HEAD`
under `--no-file-parallelism` is not this phase's — reproduce before attributing.

**Manual check (production only, and only after phase 1 has landed).** `VAPID_*` is
Production-scope on Vercel, so a preview deployment cannot send a push at all — this is a production
deploy or a local production build, never a preview. On the XS Max, with the PWA installed and
notifications on from `/me`:

1. Ask Nina for a photo in `/nina`, lock the phone. ~90 s later it buzzes with her caption; tapping
   opens `/nina` with the picture already rendered in the bubble, not a caption above an empty frame.
2. Turn notifications off on `/me` (which revokes the subscription), ask again. The photo still
   arrives in the chat and the Vercel log shows `[push] notified … skipped: 'no live subscriptions'`.
3. For the apology, the cheap read is the log rather than a 20-minute wait: a job that gives up
   writes `[nina] image job failed` followed by a `[push] notified` line with
   `kind: 'photo_apology'`.

**Exit criteria:**
- A delivered photograph sends exactly one push whose body is the bubble's caption and whose
  `messageId` is the row that was written.
- A failed or swept **selfie** job sends exactly one push carrying her apology, from either caller.
- An **avatar** job (delivered or failed) and a **hidden** (`deletedAt != null`) job send nothing —
  by not reaching the helper, not by a second gate.
- A notify failure leaves the `nina_messages` row, the `nina_message_images` row, the closed
  `nina_turns` ledger, the blob release and the sweep's count all exactly as they were.
- `npm run typecheck`, `npm run lint` and `npm test` are green.

---

## Handoffs

- **`scripts/nina-image-worker/finish.ts` — Phase 5, R1.** The off-platform host writes the *same
  two messages* — the photograph at its raw-SQL insert (`finish.ts:142`) and the apology in
  `closeFailed` — and sends its own pushes for them under that directory's module rules
  (`.ts`-suffixed relative imports, no `@/`, no `server-only`, `createRequire` for CJS). It cannot
  import `lib/push/send.ts`, so it cannot reuse this phase's call. **It also uses DIFFERENT kinds —
  `'worker_photo_delivered'` and `'worker_photo_apology'` — on purpose:** see this phase's Requires
  block. Not touched here, and deliberately: a second copy of my call site in `scripts/` would be
  phase 5's work done twice and wrong.
- **`lib/nina/turnrun.ts` — Phase 2, R1.** Reading `imagerun.ts` end to end surfaced that
  `runNinaImageJob` is fired from `fireNinaImageGeneration` inside the same `after()` that phase 2's
  turn runs in. Nothing for me to do; noting it because a chat turn that asks for a photo produces a
  reply push (phase 2) and, ~90 s later, a photo push (mine). That is two buzzes for one exchange and
  it is correct — `PUSH_NOTIFICATION_TAG` is one tag with `renotify: true`, so the second replaces the
  first in the tray rather than stacking.
- **`lib/admin/chatPhotoActions.ts` — Phase 4, R2.** Same bubble-plus-image-row pair as my
  `finishSelfie` site and the same ordering question; phase 4 owns it.
- **Not my requirement: `finishAvatar` and the `avatar_changed` announcement.** An avatar job writes
  no `nina_messages` row, and the announcement it does produce already pushes through
  `lib/nina/proactive.ts` — which is R2's territory and invariant 1's untouchable file. No change
  proposed anywhere.
- **Observed, deliberately not fixed here:** `tests/nina.imagerun.test.ts` and
  `tests/nina.imagelog.test.ts` both use `vi.clearAllMocks()` in `beforeEach`, which leaves
  implementations and unconsumed `mockResolvedValueOnce` queues in place — `nina.imagerun.test.ts`
  already has one such chain at its dedup-race case. Converting either file to `resetAllMocks` is a
  behaviour change to tests this phase did not otherwise need to touch. My additions are written to
  be immune (one `notify.mockResolvedValue(undefined)` line in the existing `beforeEach`, no `Once`
  queues), and the new file uses `resetAllMocks` from the start.

---

## Rollback

`git revert` of this phase's single commit. It adds two import lines, one `try`-wrapped call each in
two functions, one binding (`const [apology] = …`) and one hoisted `const body`; it removes nothing,
changes no schema, no migration, no wire format and no exported signature. Reverting restores the
behaviour that shipped, and it is independent of phases 2, 4 and 5 — none of them reads
`lib/nina/imagerun.ts` or `lib/nina/imagejobs.ts`.

Reverting **phase 1** without reverting this phase breaks the build at two import lines
(`notifyNinaPush` would not resolve), which is why the plan index's whole-set rollback is 5→1 in that
order.

Without a deploy at all: turning notifications off on `/me` revokes the subscription and makes both
new call sites report `skipped: 'no live subscriptions'` — a no-op reached, not a no-op skipped.
