# Phase 1: Redo — reopen a failed job from its own args

**Plan set:** `NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md`
**Analysis:** `20260907-072951-JB2R_code_analyzer.md`
**Satisfies:** R1 — a redo icon on each `/nina/jobs` row, one tap, no confirmation, that re-runs the failed job; and when the triggering chat message is gone, the photograph still lands, in the most recent session
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` + `components/nina` + `app/nina/jobs`

---

## Goal

After this phase, a failed row on `/nina/jobs` carries a redo icon. One tap opens a **new**
`nina_turns` job from the failed row's stored `args` — same prompt, same seed, same `replyToId`,
`attempts` reset to 0 — checks the daily cap first, and schedules the generation in `after()` on a
segment that now exports `maxDuration = 300`. The failed row is never touched: its `status`, its
`error_code` and its `cost_micro_usd` stand. `/nina/about` renders byte for byte as it does on
`origin/main`, because the controls are opt-in through a prop only `/nina/jobs` sets.

R1's second sentence — "if the chat is no longer there, we will keep executing the reload, nina can
just mention the new photograph in the most recent chat session" — is **already true in shipped
code** and this phase adds a test that pins it rather than a second implementation of it.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts.

**Deletes:** nothing.

**Renames:** nothing.

**Creates:**
- `lib/nina/jobview.ts` → `jobCanRedo(stage: NinaJobStage): boolean`
- `lib/nina/jobview.ts` → `type NinaJobRefusal = 'not-found' | 'not-failed' | 'no-args' | 'capped'`
- `lib/nina/jobview.ts` → `ninaJobTitle(item: { scene: string | null; purpose: 'selfie' | 'avatar' }): string`
- `lib/nina/jobview.ts` → `NinaJobListItem.canRedo: boolean` (new **required** field on an existing interface)
- `lib/nina/imagejobs.ts` → `type NinaImageReopen` and `reopenNinaImageJob(userId, jobId)`
- `lib/nina/jobActions.ts` → **new `'use server'` module**: `interface NinaJobActionResult`, `redoNinaImageJob({ jobId })`
- `components/nina/NinaJobActions.tsx` → **new `'use client'` module**: `NinaJobActions({ item })`
- `components/nina/NinaJobList.tsx` → new optional prop `actions?: boolean`
- `app/nina/jobs/page.tsx` → `export const maxDuration = 300`
- `tests/nina.jobActions.test.ts` → new test file

**Signature changes:**
- `toNinaJobListItems` — same signature, one extra field on each returned item (`canRedo`).
- `NinaJobList` — one new **optional** prop. Both existing call sites still compile unchanged.

**Requires (from earlier phases):** none. This phase is first.

**Leaves alone (owned by others / verified only):**
- `lib/db/schema.ts`, `drizzle/` — Phase 2. **This phase generates no migration.**
- `components/nina/NinaAboutScreen.tsx`, `app/nina/about/page.tsx` — not edited by anybody. Verified
  unchanged: they never pass `actions`, so the new prop is `undefined` and the rendered markup is
  identical.
- `app/nina/jobs/[id]/page.tsx`, `lib/nina/imagerun.ts`, `lib/nina/selfiegen.ts`, `scripts/` — not
  edited. `lib/nina/imagerun.ts` is **read and imported** (`fireNinaImageGeneration`,
  `runNinaImageJob`) and its `finishSelfie` behaviour is asserted by the new test, but not one line
  of it changes.
- `lib/nina/imagejobs.ts`'s seven read functions — Phase 2 adds `isNull(deletedAt)` to them. This
  phase adds **one new exported function** and edits none of them.

**What Phase 2 will append to files this phase creates (designed for, stated here so the reconciler
can check it landed):**

| Phase 2 appends | Where | The seam this phase leaves for it |
|---|---|---|
| `deleteNinaImageJob({ jobId })` | `lib/nina/jobActions.ts`, after `redoNinaImageJob` | the shared `NinaJobActionResult` type and the shared `NinaJobRefusal` vocabulary; `'not-found'` is already the right refusal for a delete and Phase 2 needs no new code there |
| a trash icon button | `components/nina/NinaJobActions.tsx`, inside the existing `<span>` control cluster | `run()` already owns the pending flag and the refusal sentence for BOTH controls; the cluster is already a flex container with `gap-0.5`; `NOTE` is already a `Record<NinaJobRefusal, string>` |
| `isNull(deletedAt)` on seven reads | `lib/nina/imagejobs.ts` | `reopenNinaImageJob`'s own `WHERE` is an **eighth** read Phase 2 must also filter. **The reconciler has added it to Phase 2 as Step 3k** — see **Handoffs** |

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/jobview.ts` | modify | `jobCanRedo` + `NinaJobRefusal` after `jobIsOpen` (:135); `ninaJobTitle` after `NinaJobListItem` (:211); `canRedo` on `NinaJobListItem` (:195-211) and in `toNinaJobListItems` (:213-230) |
| `lib/nina/imagejobs.ts` | modify | `NinaImageReopen` + `reopenNinaImageJob` inserted at :111, between `openNinaImageJob` (ends :110) and `export interface NinaImageClaim` (:112); one new type import at :20 |
| `lib/nina/jobActions.ts` | create | new `'use server'` module — `NinaJobActionResult`, `redoNinaImageJob` |
| `components/nina/NinaJobActions.tsx` | create | new `'use client'` module — the redo icon button, `run()`, `NOTE`, `RedoIcon` |
| `components/nina/NinaJobList.tsx` | modify | new `actions?: boolean` prop (:44-52); the row body (:68-113) becomes a conditional flex line |
| `app/nina/jobs/page.tsx` | modify | the "NO `maxDuration`" docstring block (:26-29) is replaced by the export and its argument; `actions` passed at :61-65 |
| `tests/nina.jobview.test.ts` | modify | imports (:5-21); two new cases inside `describe('toNinaJobListItems')` (:118-155); one new `describe` after it |
| `tests/nina.jobActions.test.ts` | create | the refusals, the verbatim copy, and R1's "the chat is gone" fallback end to end |

Eight files. No migration, no schema change, no `scripts/` change, no new dependency.

---

## Implementation Steps

### Step 1: `lib/nina/jobview.ts` — the pure rule, the refusal vocabulary, the row title

**File:** `lib/nina/jobview.ts:135` (immediately after `jobIsOpen`, before the
`NINA_JOB_STAGE_LABEL` docstring at :137)

**Change:** insert a new section. `jobCanRedo` is the rule the control renders from and the test
asserts; `NinaJobRefusal` is the vocabulary the server action and the client button share.

**Code:** insert after line 135 (`}` closing `jobIsOpen`), separated by a blank line:

```ts
/* ── the per-row controls ─────────────────────────────────────────────────────────────────── */

/**
 * **R1's redo, as a rule rather than as a `&&` inside a component.**
 *
 * `vitest.config.ts` is `environment: 'node'`, so a condition written inside
 * `components/nina/NinaJobActions.tsx` is a condition nothing in this repo can assert — the same
 * reason `jobIsOpen` and `planJobJump` live here rather than in `NinaJobList`. This function is one
 * comparison, and it is here because the plan set's invariant 6 says a rule a screen obeys is a
 * rule a test reaches.
 *
 * ── WHY `failed` AND NOTHING ELSE (plan index, *Decisions*, rung 5) ───────────────────────────
 * The user's own words are *"clicking this will redo the **failed** job"*, and each of the other
 * four stages has its own reason to be refused:
 *
 *   · `queued` / `dispatched` / `running` — the job is ALREADY being retried. `reviveNinaImageJobs`
 *     re-fires a `queued` row on the next `/nina` render and `claimNinaImageJob` bounds the whole
 *     thing at `NINA_IMAGE_MAX_ATTEMPTS`. A redo here would open a SECOND row for one photograph
 *     and bill twice for it.
 *   · `done` — the photograph exists and is in the chat. Re-rolling it is a different feature
 *     nobody asked for, and it costs one of six generations a day.
 *
 * ── AND WHY THE SERVER CHECKS IT AGAIN ANYWAY ─────────────────────────────────────────────────
 * **A control is not a guard.** This function decides whether a button is DRAWN; `redoNinaImageJob`
 * refuses a non-failed job independently, from the row it read under the runner's own `userId`,
 * because a `jobId` arriving from a browser is a claim and never a fact (plan invariant 3).
 *
 * Purpose is deliberately NOT part of the rule. A failed AVATAR job is redoable too: it re-runs
 * through `finishAvatar`, writes `nina_avatars`, and leaves `announced_at` NULL so the next cron
 * tick makes her mention it — which is exactly what a redo of that job should do.
 */
export function jobCanRedo(stage: NinaJobStage): boolean {
  return stage === 'failed'
}

/**
 * **Why a per-row action refuses, as a CODE and never as a sentence.**
 *
 * `NinaSessionActionResult` is `{ ok, next }` and carries no error prose: the server decides, the
 * calling component supplies the words, and `SessionRow`'s header records why ("there is exactly
 * one place a rule lives"). That arrangement is kept — and widened by exactly one field, because a
 * bare `ok: false` cannot distinguish "your daily photo budget is spent" from "that job is not
 * yours", and those two deserve different sentences in a language the server has no business
 * writing.
 *
 * So the wire carries a DISCRIMINANT, not copy — `NINA_JOB_JUMP_NOTE` below is the same shape one
 * screen over, and `components/nina/NinaJobActions.tsx` owns the `Record<NinaJobRefusal, string>`
 * that turns it into Indonesian.
 *
 * ── WHY IT LIVES IN THIS FILE AND NOT IN `lib/nina/jobActions.ts` ─────────────────────────────
 * Three modules need to agree about these four strings: `lib/nina/imagejobs.ts` (`server-only`,
 * produces them), `lib/nina/jobActions.ts` (`'use server'`, forwards them) and a `'use client'`
 * button (renders them). This module is the only one all three can import — it is pure, it is
 * already imported by three client components, and it imports nothing but `lib/format` and
 * `lib/id`. Declaring the union in `imagejobs.ts` would put a `server-only` import in a browser
 * bundle's type graph; declaring it in `jobActions.ts` would make a `server-only` module import a
 * `'use server'` one, which is backwards.
 *
 *   · `not-found`  — no such job of his. Covers a malformed id, another runner's id, and an id
 *                    that never existed: one answer, so nothing leaks which ids are real.
 *   · `not-failed` — the row is `pending`, `ok` or `repaired`. See `jobCanRedo`.
 *   · `no-args`    — the row cannot be redone FROM. `lib/db/schema.ts` says it in as many words:
 *                    *"a job whose args were only ever in the dispatch payload is a job that can
 *                    never be retried"*, and three production rows predate the column.
 *   · `capped`     — `ninaImageQuotaLeft` is 0. A money cap, not a feature cap.
 *
 * PHASE 2's delete action reuses this union and needs no new member: a delete is refused only when
 * the row is not his, which is `'not-found'`.
 */
export type NinaJobRefusal = 'not-found' | 'not-failed' | 'no-args' | 'capped'
```

**Impact:** two new exports, no behaviour change to anything existing.

---

**File:** `lib/nina/jobview.ts:195-211` — replace the whole `NinaJobListItem` interface

**Change:** one new required field.

**Code:** the complete replacement interface:

```ts
export interface NinaJobListItem {
  id: string
  href: string
  stage: NinaJobStage
  stageLabel: string
  purpose: 'selfie' | 'avatar'
  /** The scene the prompt was built around, or null for a row written before `args` carried one. */
  scene: string | null
  attempts: number
  createdAtMs: number
  /** Present only on a failed job. Already in words; `null` on every other stage. */
  errorLabel: string | null
  /** The generation call's own latency, or null. `null` on an open job by construction. */
  latencyMs: number | null
  /** Whether a live clock is honest for this row. See D4. */
  open: boolean
  /**
   * Whether R1's redo control is drawn on this row — `jobCanRedo(stage)`, resolved HERE so the
   * only surface that draws it cannot disagree with the only test that asserts it.
   *
   * REQUIRED and not optional, deliberately. Both callers of `toNinaJobListItems` go through that
   * one function, so there is no third construction site for an optional field to be forgotten at,
   * and `tsc` is the right thing to notice if one ever appears. `/nina/about` receives the field
   * and ignores it: the controls are opt-in per SURFACE (`NinaJobList`'s `actions` prop), not per
   * item, so a read-only surface simply never looks at it.
   */
  canRedo: boolean
}
```

**Impact:** `tests/nina.jobview.test.ts` and both page call sites keep compiling — the field is
produced by `toNinaJobListItems`, which is the only constructor.

---

**File:** `lib/nina/jobview.ts:211` — insert `ninaJobTitle` immediately after the interface above,
before `toNinaJobListItems`

**Change:** one pure helper, so the redo button's accessible name and the row's visible title are
the same string by construction.

**Code:**

```ts
/**
 * What a row is CALLED — the scene if it has one, otherwise what kind of photograph it was.
 *
 * It exists because R1's control needs an accessible name and **an icon button's accessible name
 * must be the visible label of the thing it acts on**, or a screen reader announces "Coba lagi" six
 * times in a list of six rows. `NinaJobList` renders this expression as the row's title and
 * `NinaJobActions` renders it inside `aria-label`; two copies of it would drift the first time the
 * fallback wording changed, and the drift would be invisible to everyone who can see the screen.
 *
 * `Pick`-shaped rather than taking a whole `NinaJobListItem`, on `planJobJump`'s precedent: the
 * function needs two fields and a test should be able to hand it two fields.
 */
export function ninaJobTitle(item: Pick<NinaJobListItem, 'scene' | 'purpose'>): string {
  return item.scene ?? (item.purpose === 'avatar' ? 'Foto profil' : 'Selfie')
}
```

**Impact:** `NinaJobList` starts calling it in Step 5 and renders **the identical string** it
renders today, so `/nina/about`'s DOM is unchanged.

---

**File:** `lib/nina/jobview.ts:213-230` — replace the whole `toNinaJobListItems`

**Change:** set `canRedo` from the rule.

**Code:** the complete replacement function:

```ts
export function toNinaJobListItems(rows: readonly JobLike[]): NinaJobListItem[] {
  return rows.map((row) => {
    const stage = jobStage({ status: row.status, errorCode: row.errorCode })
    return {
      id: row.id,
      href: ninaJobHref(row.id),
      stage,
      stageLabel: NINA_JOB_STAGE_LABEL[stage],
      purpose: row.purpose,
      scene: row.scene,
      attempts: row.attempts,
      createdAtMs: row.createdAt.getTime(),
      errorLabel: stage === 'failed' ? jobErrorLabel(row.errorCode) : null,
      latencyMs: row.latencyMs,
      open: jobIsOpen(stage),
      canRedo: jobCanRedo(stage),
    }
  })
}
```

**Impact:** every item now carries `canRedo`. `errorLabel` and `canRedo` are both derived from the
same `stage`, so a row that shows a failure sentence is exactly a row that offers a redo — which is
the property the runner actually experiences.

---

### Step 2: `lib/nina/imagejobs.ts` — `reopenNinaImageJob`

**File:** `lib/nina/imagejobs.ts:20` — extend the existing type import block

**Change:** the module needs `NinaJobRefusal`. `./jobview` imports only `@/lib/format` and
`@/lib/id`, so there is no cycle.

**Code:** insert a new import statement immediately after the `} from './imagerecipe'` line (:20),
before the `import { ... } from './queries'` block (:21):

```ts
import type { NinaJobRefusal } from './jobview'
```

**Impact:** none at runtime — `import type` is erased.

---

**File:** `lib/nina/imagejobs.ts:111` — insert between `openNinaImageJob` (ends :110) and
`export interface NinaImageClaim` (:112)

**Change:** the redo's whole server side: read the failed row owner-scoped, refuse anything that
cannot be redone, check the cap, open a NEW row from the SAME args.

**Code:** the complete insertion (a blank line, then this block, then a blank line before line 112):

```ts
/**
 * **R1's redo. It INSERTS; it never resets.**
 *
 * ── WHY A NEW ROW AND NOT AN UPDATE OF THE FAILED ONE (plan index *Decisions*, rung 1) ────────
 * `nina_turns` is the money ledger. Every writer in this file accumulates with
 * `coalesce(cost_micro_usd, 0) + spend` for one stated reason — *"money is never spent silently"* —
 * and a redo that flipped the failed row back to `status = 'pending'` would delete a billed
 * attempt from the audit trail: the `$0.04` it recorded, the `error_code` that says WHY it died,
 * and the `latency_ms` that says how long it took to die. The runner opens `/nina/jobs` precisely
 * to read those three numbers. So the failed row is READ and left exactly as it is, and the retry
 * is a second row that will accumulate its own spend. Two rows, two bills, two truths.
 *
 * The visible consequence is deliberate: after a redo, `/nina/jobs` shows BOTH — the old `Gagal`
 * row and a new `Antre` row above it. That is the ledger being honest, and it is also why the
 * redo control stays on the failed row afterwards.
 *
 * ── THE ARGS ARE COPIED VERBATIM (rung 6) ─────────────────────────────────────────────────────
 * Same `prompt`, same `seed`, same `replyToId`, same `scene`, same `mood`, same `sidecar`, same
 * `purpose`, same `source`. `requeueNinaImageJob` already states the rule for the retry inside a
 * job — *"the same prompt and the same seed — which is why a retry produces the same photograph
 * rather than a different one"* — and a redo is the same act performed by a human instead of by
 * the loop. Re-rolling the seed here would make the button "generate a different photo", which is
 * not what "redo" says. **`attempts: 0` is the ONE field that changes**, and it must: the row is
 * new, `claimNinaImageJob` bounds a job at `NINA_IMAGE_MAX_ATTEMPTS`, and a copied `attempts: 3`
 * would open a job that no claim predicate in this file can ever pick up.
 *
 * ── THE ORDER IS THE CAP, THEN THE INSERT (rung 6) ────────────────────────────────────────────
 * `generateNinaSelfie` states it: the cap is checked *"before the row is opened and therefore
 * before a cent is spent"*. A redo spends money exactly like a first request, and
 * `NINA_IMAGE_DAILY_CAP` is *"a money cap and not a feature cap"* — so it applies, and refusing
 * AFTER the insert would leave a `queued` row nobody will ever run. The cap read is deliberately
 * the LAST of the four refusals: the three cheap in-memory checks answer first, so a job that was
 * never redoable does not cost an extra indexed count to be told so.
 *
 * ── WHAT `no-args` ACTUALLY GUARDS ────────────────────────────────────────────────────────────
 * Not merely `args IS NULL`. `runNinaImageJob` calls `callNinaImageModel(args.prompt, args.seed)`,
 * so a row whose jsonb is present but whose `prompt` is missing or empty would open a job that
 * reaches the provider with nothing to draw, burn a generation off the daily cap and fail. The
 * three pre-`args` production rows and any future shape change land in the same refusal, which is
 * the honest one: there is nothing here to redo FROM.
 *
 * ── OWNERSHIP (plan invariant 3) ──────────────────────────────────────────────────────────────
 * `eq(ninaTurns.userId, userId)` is in the `WHERE` of the read, beside `eq(ninaTurns.id, jobId)`
 * and `eq(ninaTurns.kind, 'image')`. Another runner's job and a job that never existed both come
 * back `not-found`, identically. `kind = 'image'` is load-bearing for the reason the block above
 * `listNinaImageJobs` gives at length: since phase 3 this table also holds `kind = 'chat'` rows
 * sitting in `status = 'pending'` with a completely different `args` shape.
 *
 * It returns a discriminated union rather than throwing, because the caller is a Server Action
 * whose job is to hand a refusal code back to a button — `generateNinaSelfie`'s `NinaSelfieResult`
 * is the same shape for the same reason.
 */
export type NinaImageReopen =
  | {
      ok: true
      /** The NEW row. The failed one keeps its own id and its own numbers. */
      jobId: string
      purpose: NinaImagePurpose
      /** Copied verbatim. May name a message that no longer exists — see `finishSelfie`. */
      replyToId: string | null
    }
  | { ok: false; reason: NinaJobRefusal }

/**
 * Is there enough in this jsonb to run a generation from?
 *
 * A type predicate rather than a boolean so the caller's spread is typed without a cast. It checks
 * the two fields `runNinaImageJob` dereferences and nothing else: `scene`, `mood` and `sidecar` are
 * copied through whatever they are, because a missing caption is a worse photograph and a missing
 * prompt is no photograph at all.
 */
function isRedoableArgs(value: unknown): value is NinaImageJobArgs {
  if (value == null || typeof value !== 'object') return false
  const args = value as Partial<NinaImageJobArgs>
  return typeof args.prompt === 'string' && args.prompt !== '' && typeof args.seed === 'number'
}

export async function reopenNinaImageJob(
  userId: string,
  jobId: string,
): Promise<NinaImageReopen> {
  const [row] = await db
    .select({ status: ninaTurns.status, args: ninaTurns.args })
    .from(ninaTurns)
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.kind, 'image')))

  if (row == null) return { ok: false, reason: 'not-found' }

  /* `jobCanRedo` decides whether the BUTTON is drawn. This decides whether the JOB is opened, and
   * it asks the database rather than the browser. Same rule, two enforcement points, and the
   * second one is the only one that counts. */
  if (row.status !== 'failed') return { ok: false, reason: 'not-failed' }

  const args = row.args
  if (!isRedoableArgs(args)) return { ok: false, reason: 'no-args' }

  if ((await ninaImageQuotaLeft(userId)) <= 0) return { ok: false, reason: 'capped' }

  /* Verbatim, with the one field that must not be. See the header. */
  const reopenedId = await openNinaImageJob(userId, { ...args, attempts: 0 })

  return {
    ok: true,
    jobId: reopenedId,
    /* `toJobRecord`'s normalisation, kept identical so the two projections cannot disagree about a
     * purpose — the value below is what `fireNinaImageGeneration` logs and what decides whether
     * `failNinaImageJob` writes an apology. */
    purpose: args.purpose === 'avatar' ? 'avatar' : 'selfie',
    replyToId: typeof args.replyToId === 'string' ? args.replyToId : null,
  }
}
```

**Impact:** one new exported function and one new exported type. Nothing existing changes. No new
SQL runs on any existing path.

---

### Step 3: `lib/nina/jobActions.ts` — the `'use server'` module

**File:** `lib/nina/jobActions.ts` — **new file**

**Change:** create it. One action in this phase; Phase 2 appends a second below it.

**Code:** the complete file:

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { reopenNinaImageJob } from './imagejobs'
import { fireNinaImageGeneration } from './imagerun'
import { NINA_JOBS_HREF, type NinaJobRefusal } from './jobview'

/**
 * **The `/nina/jobs` row's mutations. Phase 1 puts `redoNinaImageJob` here; phase 2 appends
 * `deleteNinaImageJob` beside it.**
 *
 * ── WHY A NEW FILE AND NOT `lib/nina/actions.ts` ──────────────────────────────────────────────
 * The isolation argument `lib/nina/sessionActions.ts` and `lib/nina/albumActions.ts` each make in
 * their own headers, and it holds here for the same reason: `actions.ts` is the chat's mutation
 * surface, it is long, and every future chat phase opens it. These functions are read by one
 * screen — the tracking list — and by nothing else. Keeping them apart means `/nina/jobs` imports
 * a file no other feature is holding open, and it means a `git log` of this file is a `git log` of
 * this feature.
 *
 * ── IT SCHEDULES; IT DOES NOT CALL A MODEL (plan invariant 4) ─────────────────────────────────
 * `fireNinaImageGeneration` registers `runNinaImageJob` inside Next's `after()` and returns
 * `void`. The model call happens there, in `lib/nina/imagerun.ts`, which
 * `scripts/check-llm-payload-boundary.mjs` already lists. **This module makes no model call and
 * must never acquire one**, so that guard's file list does not change in this phase — which is
 * the structural half of "no new module reaches the provider".
 *
 * ── AND WHY `/nina/jobs` SUDDENLY NEEDS `maxDuration = 300` ───────────────────────────────────
 * A Server Action's timeout is the **page segment's**, not the action file's — Next 16.3.1's
 * `maxDuration` reference: *"If using Server Actions, set the `maxDuration` at the page level to
 * change the default timeout of all Server Actions used on the page."* And `after()` inherits it:
 * *"`after` will run for the platform's default or configured max duration of your route."*
 * `lib/nina/imagerun.ts`'s header names the consequence in advance — *"A third caller would need
 * the same line"* — and this file is that third caller. `app/nina/jobs/page.tsx` carries it.
 *
 * ── NO CONFIRMATION, AND THAT IS AN R-LEVEL DECISION ──────────────────────────────────────────
 * The user's words are *"we dont need confirmation message to execute them"*. This deliberately
 * OVERRIDES `components/nina/SessionRow.tsx`'s three-tap confirm, and the override is principled
 * rather than lazy: that control hard-deletes a conversation and its photographs with no undo,
 * whereas a redo costs one generation of a six-a-day cap and produces a photograph the runner
 * asked for. There is nothing here to protect him from.
 *
 * ── THE RESULT CARRIES A CODE, NEVER A SENTENCE ───────────────────────────────────────────────
 * `NinaSessionActionResult` is `{ ok, next }` with no prose, and `SessionRow` supplies the words.
 * Same arrangement, one field wider: `reason` is a `NinaJobRefusal` discriminant so the button can
 * say "jatah foto hari ini sudah habis" instead of "tidak bisa". The words live in
 * `components/nina/NinaJobActions.tsx`; the vocabulary lives in `lib/nina/jobview.ts`, which is the
 * only module a `server-only` reader, a `'use server'` action and a `'use client'` button can all
 * import. See its docstring.
 *
 * ── OWNERSHIP IS PROVED IN SQL, ONCE (plan invariant 3) ───────────────────────────────────────
 * `requireUserId()` is line one of every action here — above the shape check, so a signed-out
 * caller is bounced to sign-in rather than told their id was malformed, which is
 * `app/actions/share.ts`'s asserted rule. The id itself is proved by `reopenNinaImageJob`'s
 * `WHERE`; there is no separate ownership pre-check beside it to go stale.
 */

export interface NinaJobActionResult {
  ok: boolean
  /**
   * Why not, as a discriminant. `null` on success.
   *
   * Not an error STRING: the server has no business writing Indonesian, and
   * `components/nina/NinaJobActions.tsx` owns the `Record<NinaJobRefusal, string>` that renders it.
   */
  reason: NinaJobRefusal | null
}

/**
 * **R1. One tap: reopen the failed job from its own args and start generating.**
 *
 * The three things it does, in an order that matters:
 *
 *   1. `reopenNinaImageJob` — the owner-scoped read, the four refusals, the cap, and the INSERT.
 *      Nothing has been scheduled yet, so every refusal is free.
 *   2. `fireNinaImageGeneration` — `after()`, returning `void` immediately. **The runner is not
 *      waiting for a photograph**; he is waiting for the list to refresh, and that is milliseconds.
 *      A generation is ~78 s and lands in the chat when it lands, exactly as
 *      `generateNinaSelfie`'s does.
 *   3. `revalidatePath(NINA_JOBS_HREF)` — the new `Antre` row appears above the `Gagal` one.
 *
 * The `queuedBefore` / `runningBefore` cutoffs are deliberately NOT passed. Those are
 * `reviveNinaImageJobs`'s, and their whole purpose is to stop a recovery pass stealing a job
 * another host may still be starting. This job was opened microseconds ago by this invocation,
 * which is `generateNinaSelfie`'s situation exactly — `claimNinaImageJob` with neither cutoff
 * claims a `queued` row at any age, and there is no other host.
 *
 * ── NO `router.refresh()` IS ASKED OF THE CALLER ──────────────────────────────────────────────
 * `SessionRow` calls one after its actions; this control does not need it. The redo button is
 * OPT-IN per surface (`NinaJobList`'s `actions` prop) and only `app/nina/jobs/page.tsx` sets it, so
 * the path this revalidates is provably the path the runner is standing on, and Next's own note is
 * that revalidation in a Server Function *"updates the UI immediately (if viewing the affected
 * path)"*. A second refresh would be a second round trip to re-fetch what the action's own response
 * already carried.
 *
 * ── IT DOES NOT NAVIGATE ──────────────────────────────────────────────────────────────────────
 * Hence no `next` field, unlike `NinaSessionActionResult`. Nothing the runner was reading has gone
 * away — he stays on the list and watches the new row tick.
 */
export async function redoNinaImageJob(input: { jobId: string }): Promise<NinaJobActionResult> {
  const userId = await requireUserId()

  /* A segment that cannot be one of our ids is refused without a query, on `/r/[id]`'s precedent —
   * and it is refused as `not-found`, the same answer another runner's real id gets, so nothing
   * here tells a caller which ids exist. */
  if (!isValidId(input?.jobId)) return { ok: false, reason: 'not-found' }

  const reopened = await reopenNinaImageJob(userId, input.jobId)
  if (!reopened.ok) return { ok: false, reason: reopened.reason }

  fireNinaImageGeneration({
    userId,
    jobId: reopened.jobId,
    purpose: reopened.purpose,
    replyToId: reopened.replyToId,
  })

  revalidatePath(NINA_JOBS_HREF)
  return { ok: true, reason: null }
}
```

**Impact:** `/nina/jobs` becomes a route segment that can start a generation. Step 6 gives it the
`maxDuration` that makes that legal.

> **A `'use server'` module may export only async functions.** `NinaJobActionResult` is an
> `interface`, which is erased before the check ever runs — `lib/nina/sessionActions.ts` exports
> `NinaSessionActionResult` the same way and `components/nina/SessionRow.tsx` imports it as a type
> from that same `'use server'` file. That precedent is why the client below may
> `import { type NinaJobActionResult } from '@/lib/nina/jobActions'`.

---

### Step 4: `components/nina/NinaJobActions.tsx` — the control

**File:** `components/nina/NinaJobActions.tsx` — **new file**

**Change:** create it.

**Code:** the complete file:

```tsx
'use client'

import * as React from 'react'

import { redoNinaImageJob, type NinaJobActionResult } from '@/lib/nina/jobActions'
import { ninaJobTitle, type NinaJobListItem, type NinaJobRefusal } from '@/lib/nina/jobview'

/**
 * **R1's redo control — one tap, no dialog — and the slot phase 2 puts its delete button in.**
 *
 * ── ONE TAP, AND THE PRECEDENT IT OVERRIDES ON PURPOSE ────────────────────────────────────────
 * `components/nina/SessionRow.tsx` guards its remove behind `⋯` → Hapus → Hapus chat, and its
 * header explains why at length: that control hard-deletes a conversation and, through two
 * cascades, its photographs — permanently, with no undo. **None of that transfers here**, and the
 * user said so first: *"we dont need confirmation message to execute them"*. A redo opens one row
 * and spends one of six generations a day, and what it produces is a photograph he asked for. So:
 * no menu, no panel, no second tap, and no `window.confirm` — which `RetryExtraction` already
 * refuses on iOS grounds anyway ("a system dialog that reads as an error").
 *
 * The mis-tap protection that IS here is the one that costs nothing: `disabled={pending}`, so a
 * double-tap cannot open two jobs. After the list refreshes he can tap again, and that is a second
 * deliberate act rather than a bug — the cap is what bounds it, on the server.
 *
 * ── WHY IT IS A SIBLING OF THE ROW'S LINK AND NOT A CHILD ─────────────────────────────────────
 * A `<button>` inside an `<a>` is invalid HTML and breaks the link's hit testing —
 * `SessionRow`'s recorded rule, one list over. So `NinaJobList` makes the row a flex line and this
 * component is the second item in it. It renders a FRAGMENT of two flex children, not one wrapper:
 * the icon cluster, which sits on the row's own line, and the refusal note, which carries `w-full`
 * so the parent's `flex-wrap` drops it onto a line of its own underneath. A sentence squeezed into
 * a 44px column would be unreadable, and an absolutely-positioned one would need a z-index over
 * rows this component does not own.
 *
 * ── THE ICON IS HAND-WRITTEN SVG ──────────────────────────────────────────────────────────────
 * `SessionRow`'s `PinIcon` and `TabBar`'s glyphs, for `TabBar`'s stated reason — "four glyphs is
 * not worth a package, and an icon font would be a second webfont on a page whose first is already
 * Poppins". `aria-hidden` on the path, because the accessible name belongs on the button.
 *
 * ── THE ACCESSIBLE NAME NAMES THE ROW ─────────────────────────────────────────────────────────
 * `Coba lagi sore di kos`, not `Coba lagi`. Six rows of "Coba lagi" is a list a screen reader
 * cannot navigate. `ninaJobTitle` is the same pure function `NinaJobList` renders as the visible
 * title, so the two are one string and cannot drift.
 *
 * ── THE SERVER OWNS THE REFUSAL; THIS FILE OWNS THE WORDS ─────────────────────────────────────
 * `NinaJobActionResult` is `{ ok, reason }` and carries no prose — `SessionRow` renders its own
 * sentence for exactly this reason, and `FolderMenu`'s rule is the one both obey: "there is
 * exactly one place a rule lives and no chance of a control that permits what the action refuses".
 * What differs from `SessionRow` is one field: `reason` is a discriminant, so `capped` can say the
 * thing a runner actually needs to hear rather than a generic "tidak bisa".
 *
 * ── WHAT PHASE 2 APPENDS, AND WHERE ───────────────────────────────────────────────────────────
 * A second `<button>` inside the SAME `<span>` cluster below, calling `run(() =>
 * deleteNinaImageJob({ jobId: item.id }))`. It needs nothing else: `run()` already owns the
 * pending flag and the note for both controls, `NOTE` is already keyed by the whole
 * `NinaJobRefusal` union, and the cluster is already a flex container. Nothing in this file has to
 * be restructured for it.
 */

/**
 * Every refusal, in his language. A `Record` over the whole union so `tsc` fails the day a fifth
 * refusal appears without a sentence — the property `NINA_JOB_JUMP_NOTE` has one module over.
 *
 * Phase 2's delete reuses `not-found` verbatim: "the row is not there any more" is the same fact
 * whichever button asked.
 */
const NOTE: Record<NinaJobRefusal, string> = {
  'not-found': 'Job ini sudah nggak ada.',
  'not-failed': 'Cuma job yang gagal yang bisa diulang.',
  'no-args': 'Job lama ini nggak nyimpan prompt-nya, jadi nggak bisa diulang.',
  capped: 'Jatah foto hari ini sudah habis. Coba lagi besok ya.',
}

export function NinaJobActions({ item }: { item: NinaJobListItem }) {
  const [note, setNote] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /**
   * Every control's submit, so the pending flag and the note cannot get out of step —
   * `SessionRow`'s `run()`, same reason and same shape. Phase 2's delete button calls this too.
   *
   * A success clears the note and does nothing else: `revalidatePath` on the server has already
   * re-rendered the list this control is standing in, so there is no navigation to perform and no
   * local state to reconcile.
   */
  function run(action: () => Promise<NinaJobActionResult>) {
    setNote(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        /* `reason` is null only when `ok` is true, so the fallback is unreachable — it is here
         * because a control that says nothing when the server refuses is worse than one that says
         * the wrong thing, and `tsc` cannot narrow a boolean-plus-nullable pair. */
        setNote(NOTE[outcome.reason ?? 'not-found'])
      }
    })
  }

  const title = ninaJobTitle(item)

  return (
    <>
      <span className="flex shrink-0 items-center gap-0.5">
        {item.canRedo && (
          <button
            type="button"
            aria-label={`Coba lagi ${title}`}
            aria-busy={pending}
            disabled={pending}
            onClick={() => run(() => redoNinaImageJob({ jobId: item.id }))}
            className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-3 disabled:opacity-40"
          >
            <RedoIcon />
          </button>
        )}
      </span>

      {note !== null && (
        /* `w-full` inside the row's `flex-wrap` is what puts this on its own line under the row.
           `role="status"` so the refusal is announced without stealing focus from the button the
           runner's finger is still on. */
        <span
          role="status"
          className="w-full px-3 pb-2 text-[12px] leading-[1.45] font-semibold text-red"
        >
          {note}
        </span>
      )}
    </>
  )
}

/**
 * A clockwise arrow that does not quite close, with a head at the top right — the shape every
 * "run it again" control has worn since a refresh button was a thing. 18px, `currentColor`, so the
 * button's `text-ink-3` and its `disabled:opacity-40` are the only styling it needs.
 *
 * `aria-hidden`, because the button already carries the name. `PinIcon`'s arrangement exactly.
 */
function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 4v5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

**Impact:** a new client component. Nothing imports it yet until Step 5.

---

### Step 5: `components/nina/NinaJobList.tsx` — the opt-in control slot

**File:** `components/nina/NinaJobList.tsx:1-7` — the import block

**Change:** import the new component and the title helper.

**Code:** the complete replacement of lines 1-7:

```tsx
'use client'

import Link from 'next/link'

import { cn } from '@/lib/cn'
import { formatJobLatency, ninaJobTitle, type NinaJobListItem } from '@/lib/nina/jobview'
import { NinaJobActions } from './NinaJobActions'
import { NinaJobElapsed } from './NinaJobElapsed'
```

---

**File:** `components/nina/NinaJobList.tsx:39-116` — replace the whole component

**Change:** the new `actions` prop, and a row that becomes a flex line **only** when it is set.

**Code:** the complete replacement (the docstring above it, lines 9-38, is extended with one new
section — given in full below so the file is unambiguous):

```tsx
/**
 * **R1's job list — and PHASE 5 RENDERS THIS EXACT COMPONENT.**
 *
 * ── WHY IT IS A CLIENT COMPONENT, AND WHY THAT IS NOT NEGOTIABLE ──────────────────────────────
 * `components/nina/NinaAboutScreen.tsx` is `'use client'` (it holds the photo viewer's state and
 * calls `useRouter`), and phase 5 puts this list inside it, directly below the Media section. A
 * Server Component cannot be rendered from a client component except through a `children` slot, so
 * a server-side list would force phase 5 to either duplicate this markup or re-plumb
 * `app/nina/about/page.tsx` around a slot — and the plan is explicit that phase 5 must not write a
 * second implementation of anything. A client component taking only serializable props is the one
 * shape both a Server Component page and a client screen can render unchanged.
 *
 * Every prop is therefore a string, a number, a boolean or null. `createdAtMs` is epoch
 * milliseconds and not a `Date` for the same reason `NinaJobElapsed` takes `nowMs`: a number is a
 * thing the two halves cannot disagree about.
 *
 * ── WHAT IT DOES NOT DECIDE ───────────────────────────────────────────────────────────────────
 * The ORDER. `listNinaImageJobs` already ordered these newest-first in SQL, and this component
 * maps rather than sorts — `planSessionList`'s rule one screen over, for its stated reason.
 *
 * The STAGE and the ERROR WORDS. Both come out of `lib/nina/jobview.ts`, pre-resolved on whichever
 * side built the items, so the list on `/nina/jobs` and the section on `/nina/about` cannot name
 * the same stage two ways.
 *
 * ── NO EMPTY-STATE COMPONENT ──────────────────────────────────────────────────────────────────
 * `EmptyState` is a dashed card with a title and an action, which is the right shape for a whole
 * screen and the wrong one for a section inside somebody else's page. So absence is one sentence,
 * worded by the CALLER: `/nina/jobs` says something different from a section under Media, and a
 * component that hard-coded either would be a component phase 5 has to fork.
 *
 * ── AND WHY THE CONTROLS ARE A PROP RATHER THAN ALWAYS THERE ──────────────────────────────────
 * **This component has two callers and only one of them is a console.** `app/nina/jobs/page.tsx`
 * is the "Proses foto" screen the user asked to improve; `components/nina/NinaAboutScreen.tsx:317`
 * renders the same rows as a SUMMARY under Media, with a "Semua" link to the real screen. Putting
 * a redo button on both would put a mutation on a page nobody asked to mutate from.
 *
 * So `actions` is absent by default and set by `/nina/jobs` alone — and when it is absent the
 * markup below is byte for byte what it was before this phase: `<li>` gets `className={undefined}`
 * (React omits the attribute entirely), the `<a>` gets the same class string in the same order, and
 * `{false && …}` renders nothing. That equality is the plan set's invariant 5 and it is checked by
 * reading this diff, because there is no DOM test in this repo to check it for us.
 *
 * A RENDER-PROP would have been the more flexible shape — `renderActions?: (item) => ReactNode` —
 * and it is impossible here: `app/nina/jobs/page.tsx` is a Server Component, and a function is not
 * a serialisable prop across that boundary. A boolean is what the seam supports.
 */
export function NinaJobList({
  items,
  nowMs,
  emptyText,
  actions,
  className,
}: {
  /** Already ordered newest-first by `listNinaImageJobs`. Never re-sorted below this line. */
  items: readonly NinaJobListItem[]
  /** The server's clock at render. See `NinaJobElapsed`. */
  nowMs: number
  /** What absence says on this surface. */
  emptyText: string
  /**
   * Draw the per-row mutation controls (R1's redo; phase 2's delete).
   *
   * **Absent by default, and only `app/nina/jobs/page.tsx` sets it.** See the header. Optional
   * rather than required precisely so `NinaAboutScreen` compiles untouched — the read-only surface
   * is the one that should need no edit.
   */
  actions?: boolean
  className?: string
}) {
  if (items.length === 0) {
    return (
      <p
        className={cn(
          'rounded-field border border-dashed border-rule px-4 py-6 text-center text-[12px] font-medium text-ink-2',
          className,
        )}
      >
        {emptyText}
      </p>
    )
  }

  const withActions = actions === true

  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((item) => {
        /* `Card.tsx`'s one surface for a row that is still doing something; bare paper for a row
           that has finished. `SessionRow` makes the same distinction the same way. It moves from
           the `<a>` to the `<li>` ONLY in actions mode, so the card wraps the controls instead of
           stopping short of them — and so the read-only surface's markup is untouched. */
        const surface = item.open ? 'bg-card shadow-card' : 'bg-transparent'

        return (
          <li
            key={item.id}
            className={
              withActions
                ? cn('flex flex-wrap items-center gap-x-1 rounded-card pr-1', surface)
                : undefined
            }
          >
            <Link
              href={item.href}
              className={cn(
                'block rounded-card px-3 py-2.5',
                withActions ? 'min-w-0 flex-1' : surface,
              )}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] leading-[1.35] font-semibold text-ink">
                  {ninaJobTitle(item)}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-ink-2 tabular-nums">
                  {item.open ? (
                    <NinaJobElapsed startedAtMs={item.createdAtMs} nowMs={nowMs} running />
                  ) : (
                    formatJobLatency(item.latencyMs)
                  )}
                </span>
              </span>

              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-ink-3">
                <span className={item.stage === 'failed' ? 'font-semibold text-red' : undefined}>
                  {item.stageLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span>{item.purpose === 'avatar' ? 'Foto profil' : 'Selfie'}</span>
                {item.attempts > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{item.attempts}x dicoba</span>
                  </>
                )}
              </span>

              {item.errorLabel !== null && (
                <span className="mt-1 block max-w-[54ch] text-[12px] leading-[1.45] font-medium text-red">
                  {item.errorLabel}
                </span>
              )}
            </Link>

            {withActions && <NinaJobActions item={item} />}
          </li>
        )
      })}
    </ul>
  )
}
```

**Impact:**
- With `actions` absent — `/nina/about` — the emitted markup is identical to `origin/main`:
  `<li>` carries no `class`, the `<a>`'s class string is `cn('block rounded-card px-3 py-2.5',
  surface)` which is the same two arguments in the same order as before, `ninaJobTitle(item)`
  returns the same string the inline expression returned, and `{false && …}` emits nothing.
- With `actions` set — `/nina/jobs` — the row is a wrapping flex line: link, control cluster, and a
  full-width refusal line when there is one.

---

### Step 6: `app/nina/jobs/page.tsx` — `maxDuration` and the prop

**File:** `app/nina/jobs/page.tsx:26-29` — replace the "NO `maxDuration`" docstring section

**Change:** that block now asserts the opposite of the truth, so it is replaced rather than left to
mislead. The docstring section becomes the argument FOR the export.

**Code:** replace lines 26-29, which currently read

```
 * ── NO `maxDuration` ──────────────────────────────────────────────────────────────────────────
 * That export exists on `/nina` and `/r/[id]` because a Server Action's timeout is the page
 * SEGMENT's. This route calls no action and awaits no model; the platform default is correct and an
 * export claiming otherwise would be cargo.
```

with

```
 * ── `maxDuration = 300`, AND IT USED TO SAY THE OPPOSITE ──────────────────────────────────────
 * This block used to argue that the export would be cargo, on the true premise that the route
 * "calls no action and awaits no model". **R1 made that premise false.** `NinaJobActions` calls
 * `redoNinaImageJob`, which registers a generation in `after()`; a Server Action's timeout is the
 * page SEGMENT's — Next 16.3.1's `maxDuration` reference: *"If using Server Actions, set the
 * `maxDuration` at the page level to change the default timeout of all Server Actions used on the
 * page"* — and `after()` inherits the same budget: *"`after` will run for the platform's default
 * or configured max duration of your route"*.
 *
 * `lib/nina/imagerun.ts`'s header predicted this exact edit: `app/nina/page.tsx` and
 * `app/api/cron/nina/route.ts` are the two segments that can start a generation, and *"a third
 * caller would need the same line"*. This is the third caller. Without it the platform default
 * kills the invocation partway through a 78 s generation and the runner gets a job that is
 * `pending` forever until a sweep apologises for it — which is the failure this whole feature
 * exists to let him recover from.
 *
 * See `app/nina/page.tsx`'s own `maxDuration` block for why the number is 300 and not 60, and for
 * why it is a LITERAL: segment config exports are statically analysed at build time and an
 * imported constant is not a value the analyser can see.
```

---

**File:** `app/nina/jobs/page.tsx:35` — add the export between the closing `*/` of the page
docstring and `export default async function NinaJobsPage()`

**Code:**

```ts
export const maxDuration = 300
```

so that region of the file reads:

```ts
 * See `app/nina/page.tsx`'s own `maxDuration` block for why the number is 300 and not 60, and for
 * why it is a LITERAL: segment config exports are statically analysed at build time and an
 * imported constant is not a value the analyser can see.
 */
export const maxDuration = 300

export default async function NinaJobsPage() {
```

---

**File:** `app/nina/jobs/page.tsx:61-65` — pass the prop

**Change:** `actions` — set here and nowhere else.

**Code:** the complete replacement of the `<NinaJobList …/>` element:

```tsx
      <NinaJobList
        items={toNinaJobListItems(jobs)}
        nowMs={nowMs}
        emptyText="Belum ada foto yang pernah digenerate. Minta Nina kirim satu di chat."
        /* The one caller that sets it. `components/nina/NinaAboutScreen.tsx` renders the same
           component as a read-only summary and deliberately does not — see `NinaJobList`'s header
           and the plan's invariant 5. */
        actions
      />
```

**Impact:** `/nina/jobs` gains the controls and a 300 s segment budget. Nothing else on the page
changes; it is still one indexed read and still writes nothing during render.

---

### Step 7: `tests/nina.jobview.test.ts` — the pure rules

**File:** `tests/nina.jobview.test.ts:5-21` — the import block

**Code:** the complete replacement:

```ts
import {
  JOB_JUMP_PARAM,
  NINA_JOBS_HREF,
  NINA_JOB_JUMP_NOTE,
  NINA_JOB_STAGE_LABEL,
  formatJobLatency,
  formatMicroUsd,
  jobCanRedo,
  jobElapsedSeconds,
  jobErrorLabel,
  jobIsOpen,
  jobStage,
  ninaJobHref,
  ninaJobTitle,
  ninaJumpHref,
  parseNinaJumpParam,
  planJobJump,
  toNinaJobListItems,
} from '@/lib/nina/jobview'
```

---

**File:** `tests/nina.jobview.test.ts:154` — two new cases inside the existing
`describe('toNinaJobListItems')`, after `it('links each row at its own detail page', …)` and before
that block's closing `})` at line 155

**Code:**

```ts
  it('offers a redo on the failed row and on no other', () => {
    /*
     * The two derivations that share one `stage`: a row that shows a failure sentence is exactly a
     * row that offers a redo. Coupling them here rather than in the component is the point of
     * `jobCanRedo` existing at all — `vitest` is `environment: 'node'` and cannot reach a rule
     * living inside `NinaJobActions`.
     */
    const [open] = toNinaJobListItems([base])
    expect(open!.canRedo).toBe(false)

    const [failed] = toNinaJobListItems([{ ...base, status: 'failed', errorCode: 'stale' }])
    expect(failed!.canRedo).toBe(true)
    expect(failed!.errorLabel).not.toBeNull()

    const [done] = toNinaJobListItems([{ ...base, status: 'ok', errorCode: null }])
    expect(done!.canRedo).toBe(false)
  })

  it('titles a row by its scene, and by its purpose when it has none', () => {
    /* The row's visible title and the redo button's accessible name are this one string. Two
     * copies of it would drift, and the drift would be invisible to anyone who can see the
     * screen. */
    const [item] = toNinaJobListItems([base])
    expect(ninaJobTitle(item!)).toBe('sore di kos')
    expect(ninaJobTitle({ scene: null, purpose: 'selfie' })).toBe('Selfie')
    expect(ninaJobTitle({ scene: null, purpose: 'avatar' })).toBe('Foto profil')
  })
```

---

**File:** `tests/nina.jobview.test.ts:155` — a new `describe` inserted immediately after the
`toNinaJobListItems` block closes, before `describe('planJobJump names each way there is no bubble')`

**Code:**

```ts
describe('jobCanRedo is R1’s one rule, and it is narrow', () => {
  it('says yes to a failed job', () => {
    expect(jobCanRedo('failed')).toBe(true)
  })

  it('never offers a redo for a job something is already retrying', () => {
    /*
     * D3, rung 5. `reviveNinaImageJobs` re-fires a `queued` row on the next `/nina` render and
     * `claimNinaImageJob` bounds the whole thing at `NINA_IMAGE_MAX_ATTEMPTS`; a redo here would
     * open a SECOND row for one photograph and bill twice for it. The two properties are asserted
     * together on purpose — "open" and "redoable" must never both be true for one stage.
     */
    for (const stage of ['queued', 'dispatched', 'running'] as const) {
      expect(jobIsOpen(stage)).toBe(true)
      expect(jobCanRedo(stage)).toBe(false)
    }
  })

  it('never offers a redo for a photograph that already exists', () => {
    /* A re-roll of a `done` job is a different feature nobody asked for, and it costs one of six
     * generations a day. */
    expect(jobCanRedo('done')).toBe(false)
  })
})
```

**Impact:** `npm run test` covers the rule, the field and the title. No existing case changes.

---

### Step 8: `tests/nina.jobActions.test.ts` — the refusals, the verbatim copy, and R1's fallback

**File:** `tests/nina.jobActions.test.ts` — **new file**

**Change:** create it.

**What is real and what is mocked, and why it is arranged this way.** Only the EDGES are mocked —
`@/lib/db`, `@/lib/nina/queries`, `@/lib/nina/imagecall`, `@vercel/blob`, `next/server`,
`next/cache`, `@/lib/auth/requireUserId`. Everything this feature actually consists of runs for
real: `lib/nina/jobActions.ts`, `lib/nina/imagejobs.ts`, `lib/nina/jobview.ts`,
`lib/nina/imagerun.ts` and `lib/nina/sessionResolve.ts`. That is what lets one file assert both the
action's refusals AND R1's second sentence end to end — mocking `@/lib/nina/imagejobs` (the
shorter route to the first half) would have made the second half untestable in the same file,
because `vi.mock` is file-scoped and hoisted.

`vi.mock('@/lib/nina/queries', …)` also covers `lib/nina/imagerun.ts`'s and
`lib/nina/sessionResolve.ts`'s relative `'./queries'` imports: Vitest keys its mock registry on the
RESOLVED module path, and both specifiers resolve to `<root>/lib/nina/queries.ts`.

**Its factory must be exhaustive**, because a named import that the factory omits is a link-time
error and not a runtime one. Seven names are needed and the list is closed: `imagejobs.ts` takes
`countNinaTurnsSince`, `getNinaMessagesByIds`, `insertNinaMessages`, `insertNinaTurn` (`:21-26`);
`imagerun.ts` takes `getNinaMessagesByIds`, `insertNinaAvatarAsCurrent`, `insertNinaMessageImages`,
`insertNinaMessages`; `sessionResolve.ts` takes `ensureNinaSession`, `getNinaMessagesByIds`. The
`@/lib/db` factory needs one name for the same reason: `db`.

The repo compiles with `verbatimModuleSyntax` and `noUncheckedIndexedAccess`, so every type-only
import below carries an explicit `type` modifier and every `mock.calls[0]` carries a `!`.

**Code:** the complete file:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NinaImageJobArgs } from '@/lib/nina/imagerecipe'

/**
 * **`/nina/jobs`'s redo, from the tap to the photograph.**
 *
 * Four properties, in the order they would hurt if they were wrong:
 *
 *   1. **The failed row is never touched.** `nina_turns` is the money ledger (plan invariant 2).
 *      A redo INSERTS a second row from the first one's `args`; it does not reset a terminal row's
 *      `status`, its `error_code` or its `cost_micro_usd`. The assertion is that no UPDATE is
 *      issued on the refusal paths and that the INSERT carries the ORIGINAL job's arguments.
 *   2. **The control is not the guard.** `jobCanRedo` decides whether a button is drawn;
 *      `redoNinaImageJob` refuses a non-failed job independently, because a `jobId` from a browser
 *      is a claim and not a fact (plan invariant 3).
 *   3. **The args are copied verbatim, `attempts` excepted.** Same prompt, same seed, same
 *      `replyToId` — `requeueNinaImageJob`'s stated rule, applied to a human's retry. `attempts`
 *      MUST reset, or `claimNinaImageJob`'s `attempts < NINA_IMAGE_MAX_ATTEMPTS` makes the new row
 *      unclaimable the moment it is written.
 *   4. **R1's second sentence, which is already shipped code.** *"if the chat is no longer there,
 *      we will keep executing the reload, nina can just mention the new photograph in the most
 *      recent chat session."* `finishSelfie` (`lib/nina/imagerun.ts:167`) resolves the landing
 *      session as `quoted?.sessionId ?? (await resolveNinaWriteSession(userId))`, and
 *      `resolveNinaWriteSession` -> `ensureNinaSession` returns the most recently active session,
 *      CREATING one when there is none. Nothing new is written for R1; this suite pins the
 *      behaviour so a future edit cannot silently remove it, and so nobody adds a second
 *      session-resolution path beside it.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `@/lib/db`, `@/lib/nina/queries`, `@/lib/nina/imagecall`, `@vercel/blob`, `next/server`,
 * `next/cache` and `@/lib/auth/requireUserId`. Everything in between — `jobActions.ts`,
 * `imagejobs.ts`, `imagerun.ts`, `sessionResolve.ts`, `jobview.ts` — is the real module. Mocking
 * `@/lib/nina/imagejobs` would have been shorter and would have made property 4 untestable in this
 * file, since `vi.mock` is hoisted and file-scoped: the same suite cannot both stub a module and
 * drive the real one.
 */

/* ── the edges ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `vi.hoisted`, because `vi.mock`'s factory is lifted above every declaration in this file.
 *
 * `deferred` collects what `fireNinaImageGeneration` hands to `after()` — the SAME arrangement
 * `tests/integration/ninaImageE2E.int.test.ts` uses and for its stated reason: on this branch the
 * collected callback IS the generation, not a doorbell, so the suite drives it itself and owns the
 * ordering.
 */
const { deferred, dbRows } = vi.hoisted(() => ({
  deferred: [] as Array<() => unknown>,
  dbRows: { select: [] as unknown[], update: [] as unknown[] },
}))

vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

/**
 * A drizzle stand-in for the two chains this feature builds.
 *
 * `reopenNinaImageJob` awaits `db.select({...}).from(t).where(...)`. `claimNinaImageJob` awaits
 * `db.update(t).set({...}).where(...).returning({...})`, and `completeNinaImageJob` awaits the same
 * chain WITHOUT `.returning()` — so `where()` has to be both thenable and carry `.returning`.
 * That is what a drizzle query builder is, and the two-line thenable below is the smallest honest
 * imitation of it.
 *
 * The suite therefore asserts BRANCHING and ARGUMENTS, never SQL text. What is in the `WHERE` is
 * `tests/db.ownership.test.ts`'s question and this file does not duplicate it.
 */
vi.mock('@/lib/db', () => {
  const thenable = (rows: () => unknown[]) => ({
    returning: () => Promise.resolve(rows()),
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(rows()).then(ok, err),
  })
  return {
    db: {
      select: () => ({ from: () => ({ where: () => thenable(() => dbRows.select) }) }),
      update: () => ({ set: () => ({ where: () => thenable(() => dbRows.update) }) }),
    },
  }
})

const requireUserId = vi.fn<() => Promise<string>>()
const revalidatePath = vi.fn<(path: string) => void>()
const insertNinaTurn = vi.fn()
const countNinaTurnsSince = vi.fn()
const getNinaMessagesByIds = vi.fn()
const insertNinaMessages = vi.fn()
const insertNinaMessageImages = vi.fn()
const insertNinaAvatarAsCurrent = vi.fn()
const ensureNinaSession = vi.fn()
const callNinaImageModel = vi.fn()
const put = vi.fn()

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: () => requireUserId() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/queries', () => ({
  insertNinaTurn: (...args: unknown[]) => insertNinaTurn(...args),
  countNinaTurnsSince: (...args: unknown[]) => countNinaTurnsSince(...args),
  getNinaMessagesByIds: (...args: unknown[]) => getNinaMessagesByIds(...args),
  insertNinaMessages: (...args: unknown[]) => insertNinaMessages(...args),
  insertNinaMessageImages: (...args: unknown[]) => insertNinaMessageImages(...args),
  insertNinaAvatarAsCurrent: (...args: unknown[]) => insertNinaAvatarAsCurrent(...args),
  ensureNinaSession: (...args: unknown[]) => ensureNinaSession(...args),
}))
vi.mock('@/lib/nina/imagecall', () => ({
  callNinaImageModel: (...args: unknown[]) => callNinaImageModel(...args),
}))
vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args) }))

/* ── the fixture ───────────────────────────────────────────────────────────────────────────── */

const USER = 'u1'
/** 12 chars, so `isValidId` passes. */
const FAILED_JOB = 'jobfailed001'
const REOPENED_JOB = 'jobreopen001'
const DEAD_MESSAGE = 'msgdeleted01'
const LIVE_MESSAGE = 'msgalive0001'

/** A valid 1x1 PNG — small enough to be free, real enough for the `put` stub to be handed. */
const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** What the failed row's jsonb holds. Every field of it must survive the redo, except `attempts`. */
const ARGS: NinaImageJobArgs = {
  purpose: 'selfie',
  scene: 'sore di kos',
  mood: 'santai',
  prompt: 'a photograph of nina, late afternoon light, boarding house room',
  seed: 4242,
  replyToId: DEAD_MESSAGE,
  source: 'chat',
  attempts: 3,
  sidecar: 'prompt=…; seed=4242; purpose=selfie',
}

/** The one row `reopenNinaImageJob`'s SELECT comes back with. */
function failedRow(over: { status?: string; args?: unknown } = {}) {
  return [{ status: over.status ?? 'failed', args: 'args' in over ? over.args : { ...ARGS } }]
}

type Actions = typeof import('@/lib/nina/jobActions')
type Run = typeof import('@/lib/nina/imagerun')
let actions: Actions
let imagerun: Run

beforeEach(async () => {
  deferred.length = 0
  dbRows.select = failedRow()
  dbRows.update = []

  requireUserId.mockResolvedValue(USER)
  insertNinaTurn.mockResolvedValue(REOPENED_JOB)
  /* Well under NINA_IMAGE_DAILY_CAP, so the cap is open unless a case says otherwise. */
  countNinaTurnsSince.mockResolvedValue(0)
  getNinaMessagesByIds.mockResolvedValue([])
  insertNinaMessages.mockResolvedValue([{ id: 'msgwritten01', sessionId: 'sesnewest001' }])
  insertNinaMessageImages.mockResolvedValue(undefined)
  insertNinaAvatarAsCurrent.mockResolvedValue(undefined)
  ensureNinaSession.mockResolvedValue('sesnewest001')
  callNinaImageModel.mockResolvedValue({
    ok: true,
    b64: PNG_1X1_B64,
    costMicroUsd: 40_000,
    latencyMs: 78_200,
  })
  put.mockResolvedValue({ url: 'https://blob.test/nina/x.png', pathname: 'nina/x.png' })

  actions = await import('@/lib/nina/jobActions')
  imagerun = await import('@/lib/nina/imagerun')
})

afterEach(() => {
  vi.clearAllMocks()
})

/* ── the action ────────────────────────────────────────────────────────────────────────────── */

describe('redoNinaImageJob authenticates first and refuses before it writes', () => {
  it('calls requireUserId above the shape check', async () => {
    const result = await actions.redoNinaImageJob({ jobId: 'not-an-id' })

    expect(requireUserId).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: false, reason: 'not-found' })
    /* A malformed id costs no query and opens no row. */
    expect(insertNinaTurn).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('answers a job that is not his exactly as it answers one that never existed', async () => {
    /* `reopenNinaImageJob`'s WHERE carries `userId`, so a foreign id comes back empty — and it must
     * come back with the SAME word an unknown id gets, or the refusal tells a caller which ids are
     * real. */
    dbRows.select = []

    const result = await actions.redoNinaImageJob({ jobId: FAILED_JOB })

    expect(result).toEqual({ ok: false, reason: 'not-found' })
    expect(insertNinaTurn).not.toHaveBeenCalled()
  })

  it('refuses a job that did not fail, even though no button would have offered one', async () => {
    /* D3, and the reason it is enforced twice: a control is not a guard. */
    for (const status of ['pending', 'ok', 'repaired']) {
      vi.clearAllMocks()
      requireUserId.mockResolvedValue(USER)
      countNinaTurnsSince.mockResolvedValue(0)
      dbRows.select = failedRow({ status })

      const result = await actions.redoNinaImageJob({ jobId: FAILED_JOB })

      expect(result).toEqual({ ok: false, reason: 'not-failed' })
      expect(insertNinaTurn).not.toHaveBeenCalled()
      expect(deferred).toHaveLength(0)
    }
  })

  it('refuses a row there is nothing to redo from', async () => {
    /*
     * `lib/db/schema.ts`: "a job whose args were only ever in the dispatch payload is a job that
     * can never be retried". Three production rows predate the column, and a jsonb that is present
     * but prompt-less is the same fact — a generation with nothing to draw, billed against a
     * six-a-day cap.
     */
    for (const args of [null, {}, { ...ARGS, prompt: '' }, { ...ARGS, seed: null }]) {
      vi.clearAllMocks()
      requireUserId.mockResolvedValue(USER)
      countNinaTurnsSince.mockResolvedValue(0)
      dbRows.select = failedRow({ args })

      const result = await actions.redoNinaImageJob({ jobId: FAILED_JOB })

      expect(result).toEqual({ ok: false, reason: 'no-args' })
      expect(insertNinaTurn).not.toHaveBeenCalled()
    }
  })

  it('respects the daily cap, and checks it before the row is opened', async () => {
    /*
     * Rung 6, `generateNinaSelfie`'s stated order: the cap is checked "before the row is opened and
     * therefore before a cent is spent". `NINA_IMAGE_DAILY_CAP` is a money cap, and a redo spends
     * money exactly like a first request does.
     */
    countNinaTurnsSince.mockResolvedValue(999)

    const result = await actions.redoNinaImageJob({ jobId: FAILED_JOB })

    expect(result).toEqual({ ok: false, reason: 'capped' })
    expect(insertNinaTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('revalidates nothing when it refuses', async () => {
    dbRows.select = failedRow({ status: 'ok' })
    await actions.redoNinaImageJob({ jobId: FAILED_JOB })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('a redo opens a NEW row from the old one’s args', () => {
  it('copies every argument verbatim and resets only attempts', async () => {
    const result = await actions.redoNinaImageJob({ jobId: FAILED_JOB })

    expect(result).toEqual({ ok: true, reason: null })
    expect(insertNinaTurn).toHaveBeenCalledOnce()

    const [userId, insert] = insertNinaTurn.mock.calls[0]! as [string, { args: NinaImageJobArgs }]
    expect(userId).toBe(USER)
    /*
     * Rung 6, `requeueNinaImageJob`'s rule: "the same prompt and the same seed — which is why a
     * retry produces the same photograph rather than a different one". A redo is that act performed
     * by a human, so re-rolling the seed here would make the button mean something else.
     */
    expect(insert.args).toEqual({ ...ARGS, attempts: 0 })
    /* And the one field that MUST change: `claimNinaImageJob`'s WHERE carries
     * `attempts < NINA_IMAGE_MAX_ATTEMPTS`, so a copied `attempts: 3` opens a row no claim
     * predicate in `imagejobs.ts` can ever pick up. */
    expect(insert.args.attempts).toBe(0)
    expect(ARGS.attempts).toBe(3)
  })

  it('never resets the failed row — the ledger only ever grows', async () => {
    /*
     * Plan invariant 2, rung 1. The failed row keeps its `status`, its `error_code` and its
     * recorded `cost_micro_usd`; the retry is a second row that accumulates its own spend. The
     * whole redo path issues exactly one write, and it is an INSERT.
     */
    await actions.redoNinaImageJob({ jobId: FAILED_JOB })

    expect(insertNinaTurn).toHaveBeenCalledOnce()
    const [, insert] = insertNinaTurn.mock.calls[0]! as [string, Record<string, unknown>]
    expect(insert.status).toBe('pending')
    expect(insert.kind).toBe('image')
    /* Nothing on the insert carries a cost: `openNinaImageJob` writes the row before a cent is
     * spent, and the spend is added later by whichever writer measures it. */
    expect(insert.costMicroUsd).toBeUndefined()
  })

  it('schedules the generation for the NEW job and refreshes the list', async () => {
    await actions.redoNinaImageJob({ jobId: FAILED_JOB })

    /* `fireNinaImageGeneration` registered exactly one `after()` callback — the handoff really
     * happened, and this process is the only thing that will run it. */
    expect(deferred).toHaveLength(1)
    expect(revalidatePath).toHaveBeenCalledWith('/nina/jobs')
  })
})

/* ── R1's second sentence ──────────────────────────────────────────────────────────────────── */

describe('when the chat is gone, the photograph still lands', () => {
  /**
   * The rule, quoted from `lib/nina/imagerun.ts`'s `finishSelfie` (~:167), unchanged by this phase:
   *
   *     const quoted =
   *       args.replyToId == null
   *         ? null
   *         : ((await getNinaMessagesByIds(userId, [args.replyToId]))[0] ?? null)
   *
   *     const sessionId = quoted?.sessionId ?? (await resolveNinaWriteSession(userId))
   *
   * `getNinaMessagesByIds` is owner-scoped, so a `replyToId` naming a deleted message — or one
   * whose whole session was removed and cascaded — comes back EMPTY rather than throwing, and the
   * `??` takes `resolveNinaWriteSession`, which is `ensureNinaSession`: the most recently active
   * session, created when there is none (R11 lets him delete his last one).
   *
   * These cases drive `runNinaImageJob` for real. They exist so a refactor that "simplifies" that
   * `??` away, or that adds a SECOND session-resolution path beside it, fails here.
   */
  function claimReturns(args: NinaImageJobArgs) {
    dbRows.update = [{ id: REOPENED_JOB, args }]
  }

  it('delivers into the most recent session when the triggering message is gone', async () => {
    claimReturns({ ...ARGS, attempts: 1, replyToId: DEAD_MESSAGE })
    /* The message was deleted, or its session was removed and the cascade took it. Owner-scoped,
     * so both come back the same way: empty. */
    getNinaMessagesByIds.mockResolvedValue([])

    const outcome = await imagerun.runNinaImageJob(USER, REOPENED_JOB, {})

    expect(outcome).toBe('ok')
    expect(ensureNinaSession).toHaveBeenCalledWith(USER)

    const [userId, rows, sessionId] = insertNinaMessages.mock.calls[0]! as [
      string,
      Array<{ role: string; replyToId: string | null; turnId: string }>,
      string,
    ]
    expect(userId).toBe(USER)
    expect(sessionId).toBe('sesnewest001')
    /* And the bubble quotes NOTHING, because there is nothing left to quote — a `reply_to_id`
     * pointing at a deleted row would violate the foreign key and lose the photograph. */
    expect(rows[0]!.replyToId).toBeNull()
    expect(rows[0]!.role).toBe('nina')
    expect(rows[0]!.turnId).toBe(REOPENED_JOB)
  })

  it('creates a session rather than giving up when he has none left', async () => {
    /* R11 lets him remove his last conversation. `ensureNinaSession` creates one; the photograph is
     * never the thing that gets dropped. */
    claimReturns({ ...ARGS, attempts: 1, replyToId: DEAD_MESSAGE })
    getNinaMessagesByIds.mockResolvedValue([])
    ensureNinaSession.mockResolvedValue('sesfreshmade')
    insertNinaMessages.mockResolvedValue([{ id: 'msgwritten01', sessionId: 'sesfreshmade' }])

    const outcome = await imagerun.runNinaImageJob(USER, REOPENED_JOB, {})

    expect(outcome).toBe('ok')
    expect(insertNinaMessages.mock.calls[0]![2]).toBe('sesfreshmade')
  })

  it('still lands in the asking conversation when the message survived', async () => {
    /* The other half of the same `??`, and the reason there is no second resolution path: when the
     * bubble is alive the photograph goes back to it, quoting it. */
    claimReturns({ ...ARGS, attempts: 1, replyToId: LIVE_MESSAGE })
    getNinaMessagesByIds.mockResolvedValue([{ id: LIVE_MESSAGE, sessionId: 'sesasked0001' }])
    insertNinaMessages.mockResolvedValue([{ id: 'msgwritten01', sessionId: 'sesasked0001' }])

    const outcome = await imagerun.runNinaImageJob(USER, REOPENED_JOB, {})

    expect(outcome).toBe('ok')
    expect(ensureNinaSession).not.toHaveBeenCalled()
    expect(insertNinaMessages.mock.calls[0]![2]).toBe('sesasked0001')
    expect(insertNinaMessages.mock.calls[0]![1][0].replyToId).toBe(LIVE_MESSAGE)
  })

  it('carries R1 end to end: a tap on a job whose chat is gone still produces a photograph', async () => {
    /*
     * The user's sentence, as one test: "if the chat is no longer there, we will keep executing the
     * reload, nina can just mention the new photograph in the most recent chat session". Tap ->
     * new row -> `after()` -> generation -> a bubble in his newest conversation.
     */
    dbRows.select = failedRow()
    claimReturns({ ...ARGS, attempts: 1, replyToId: DEAD_MESSAGE })
    getNinaMessagesByIds.mockResolvedValue([])

    const result = await actions.redoNinaImageJob({ jobId: FAILED_JOB })
    expect(result).toEqual({ ok: true, reason: null })
    expect(deferred).toHaveLength(1)

    /* The suite drives the deferred work itself, so it owns the ordering — the arrangement
     * `tests/integration/ninaImageE2E.int.test.ts` records. */
    await deferred[0]!()

    expect(ensureNinaSession).toHaveBeenCalledWith(USER)
    expect(insertNinaMessages.mock.calls[0]![2]).toBe('sesnewest001')
    expect(insertNinaMessageImages).toHaveBeenCalledOnce()
  })
})
```

**Impact:** one new suite. It touches no network and no database — `tests/support/setup.ts`'s dummy
`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are enough, and every I/O module in the graph is stubbed
above.

---

## Verification

**Build:** `npm run typecheck` then `npm run build`
**Lint:** `npm run lint`
**Tests:** `npm run test`

**Schema check (must show NO change):** `npm run db:check` — this phase generates no migration and
`drizzle/` is untouched. If `db:generate` would produce a file, something in this phase strayed into
Phase 2.

**CI guards (run them, they are cheap):**
- `node scripts/check-llm-payload-boundary.mjs` — `lib/nina/jobActions.ts` makes no model call, so
  its file list must be unchanged.
- `node scripts/check-client-secret-boundary.mjs` — `components/nina/NinaJobActions.tsx` is a new
  `'use client'` file.

**Manual check, in order:**
1. `/nina/about` — the Media section's job rows look and behave exactly as before. No icons.
   Diff-check: `git diff origin/main -- components/nina/NinaAboutScreen.tsx app/nina/about/page.tsx`
   must be **empty**.
2. `/nina/jobs` — a `Gagal` row shows one circular-arrow button; a `Selesai` or `Antre` row shows
   none.
3. Tap the redo on a failed row. No dialog appears at any point. The button greys out for a beat, a
   new `Antre` row appears at the top, and the original `Gagal` row is still there with the same
   error sentence and the same attempt count.
4. `select id, status, error_code, cost_micro_usd from nina_turns where id = '<the failed job>'` —
   byte-identical to before the tap.
5. `select args from nina_turns where id = '<the new job>'` — same `prompt`, same `seed`, same
   `replyToId`, `attempts = 0`.
6. ~80 s later the photograph is in the chat. If the original `replyToId` named a deleted message,
   it is in the most recent conversation and quotes nothing.
7. Redo six times in a day and the seventh says *"Jatah foto hari ini sudah habis. Coba lagi besok
   ya."* under the row.

**Exit criteria:**
- Redo renders on failed rows only, fires on one tap with no confirmation of any kind, and opens a
  new `nina_turns` row whose `args` are the failed row's with `attempts: 0`.
- The failed row's `status`, `error_code` and `cost_micro_usd` are unchanged by a redo.
- `redoNinaImageJob` refuses a non-failed job, an args-less job, a foreign job and a capped runner
  independently of what the screen drew.
- A redo whose stored `replyToId` names a deleted message still delivers, into `ensureNinaSession`'s
  session — asserted by `tests/nina.jobActions.test.ts`.
- `app/nina/jobs/page.tsx` exports `maxDuration = 300`.
- `git diff origin/main -- components/nina/NinaAboutScreen.tsx app/nina/about/page.tsx` is empty and
  `/nina/about` renders identically.
- `npm run lint && npm run typecheck && npm run test` green; `npm run db:check` clean.

---

## Handoffs

**To Phase 2 — `reopenNinaImageJob` is an EIGHTH read that needs `isNull(deletedAt)`. LANDED.**
Phase 2's scope named seven reads (`listNinaImageJobs`, `getNinaImageJobDetail`,
`listOpenNinaImageJobs`, `getNinaImageJob`, `listRevivableNinaImageJobs`, `sweepStaleNinaImageJobs`,
`claimNinaImageJob` — eight statements, because the sweep has two). This phase adds one more
`SELECT` on `nina_turns` in the same file: `reopenNinaImageJob`'s owner-scoped read at the top of
the function. **A soft-deleted job must not be redoable** — the row is hidden from the list, so a
redo could only arrive from a stale tab, and it would resurrect work the runner tidied away, spend
one of six generations a day on it and deliver a photograph he had already dismissed.

**The reconciler has written this into Phase 2 as Step 3k**, with a case in
`tests/nina.softDelete.test.ts`. It costs no new refusal code: the hidden row reads as empty, and
this file's own `if (row == null) return { ok: false, reason: 'not-found' }` answers it — so
`NinaJobRefusal` is unchanged, `NOTE` is unchanged, and the button is unchanged. **Nothing in THIS
phase changes because of it**; `reopenNinaImageJob` is written here exactly as Step 2 gives it, and
Phase 2 grows the predicate on top.

**To Phase 2 — the two append points are marked, and the reconciler confirmed Phase 2 uses them.**
`lib/nina/jobActions.ts` and `components/nina/NinaJobActions.tsx` are both written to be appended to
rather than restructured; the table in **Interface Contract** says exactly what goes where and what
seam serves it. Phase 2 does not touch `run()`, `NOTE`'s type, the control cluster's layout, or
`NinaJobActionResult`, and it adds no member to `NinaJobRefusal`.

**To Phase 2 — the control-slot gate is already where R2 needs it.** Step 5 renders
`{withActions && <NinaJobActions item={item} />}`: the slot is gated on the `actions` prop ALONE,
and `canRedo` gates the redo `<button>` inside `NinaJobActions` (Step 4). So the delete control
lands on EVERY row for free. **Phase 2 does not edit `components/nina/NinaJobList.tsx`** — its
conditional "ungate" step was deleted by the reconciler as having nothing to do. If a future edit to
Step 5 ever moves `canRedo` up onto the slot or onto the `<NinaJobActions>` element, it breaks R2
silently; the gate belongs on the button.

**To Phase 2 — `tests/nina.jobActions.test.ts` does NOT mock `@/lib/nina/imagejobs`, and must not
start.** Step 8 mocks only the edges so that R1's session-fallback assertion is reachable in the
same file, and the `@/lib/nina/queries` factory must keep **exactly seven** names or the suite fails
at link time. Phase 2 appends its delete cases to the END of this file and drives them through
`dbRows.update` — the real `softDeleteNinaImageJob` running against this file's fake `db` chain —
rather than through a spy. It inserts no key into any factory here. The SQL-level proofs live in
Phase 2's own `tests/nina.softDelete.test.ts`, because `installFakeDb()` and this file's
`vi.mock('@/lib/db', …)` cannot both own `@/lib/db` in one file.

**Not done, deliberately, and not this phase's:**
- **No controls on `/nina/jobs/[id]`.** The user named the list. Out of scope per the plan index.
- **No blob cleanup and no cancel path.** Out of scope per the plan index (D8).
- **The `/nina/about` Media section stays read-only.** By design (D6), not by omission.
- **`components/nina/NinaJobList.tsx`'s row markup was NOT tidied beyond what `actions` required.**
  The `item.purpose === 'avatar' ? 'Foto profil' : 'Selfie'` expression on the meta line is now a
  near-duplicate of `ninaJobTitle`'s fallback and was left alone: it is a different sentence in a
  different position (the kind, always shown; not the title's fallback), and collapsing them would
  change `/nina/about`'s markup for a cosmetic gain.
- **`scripts/nina-image-worker.ts` is not taught anything.** It claims and finishes jobs by
  hand-written SQL; a redone job looks to it exactly like any other `queued` row, which is correct.

---

## Rollback

Code only. No schema, no migration, no data.

    git revert <phase-1 commit>

Eight files return to `origin/main`. The two new files disappear with it.

**The one thing a revert does not undo, and it is harmless:** a redo already fired has already
INSERTed a `nina_turns` row and may already have delivered a photograph. That row is an ordinary
image job — indistinguishable from one `generateNinaSelfie` opened — so the list, the detail page,
the sweep and the cap all keep treating it correctly after the revert. Nothing has to be cleaned up.

If only the CONTROL needs to go while the server side stays (a UI regression, say), the smallest
undo is deleting the single `actions` prop from `app/nina/jobs/page.tsx:61-65`: the slot stops
rendering on both surfaces and `redoNinaImageJob` becomes unreachable from any screen.
