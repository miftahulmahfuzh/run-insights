# Nina job detail: edit prompt before retry — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an icon-only "Ubah prompt" edit button and an icon-only retry button to
`/nina/jobs/[id]` ("Detail foto"), so an NSFW-triggering word can be stripped from
`nina_turns.args.prompt` before retrying a job the provider's content filter rejected — all on one
screen.

**Architecture:** Two additive, owner-scoped DB operations (`setNinaImageJobPrompt` — new;
`reopenNinaImageJob` — unchanged, reused) behind two `'use server'` action wrappers in
`lib/nina/jobActions.ts`, driving a `'use client'` component (`NinaJobDetail.tsx`) that already
renders every fact these actions touch. No schema change; `nina_turns.args` is already jsonb.

**Tech Stack:** Next.js 16 Server Actions, Drizzle ORM (fake-driver unit tests), React 19
`useTransition`, Vitest + Testing Library (`happy-dom`).

**Design doc:** `docs/plans/2026-09-17-nina-job-prompt-edit-design.md` (validated, read it first for
the "why" behind each decision below — sidecar regeneration, always-editable-regardless-of-stage,
post-retry navigation).

---

### Task 1: `NinaJobActionResult` grows a `jobId` field

**Why first:** every later task depends on the wire shape being final, and this one has zero new
behavior — it only makes an existing, already-computed fact (the new job's id) visible to a caller.
Doing it alone, first, keeps the diff that touches shared test assertions small and easy to review
before anything else lands on top of it.

**Files:**
- Modify: `lib/nina/jobActions.ts:65-127` (`NinaJobActionResult`, `redoNinaImageJob`)
- Modify: `lib/nina/jobActions.ts:169-180` (`deleteNinaImageJob`)
- Test: `tests/nina.jobActions.test.ts` (existing file — update assertions, no new file)

**Step 1: Update the existing test assertions to expect the new field (this makes them fail — the "red" step)**

In `tests/nina.jobActions.test.ts`, change every literal result object to include `jobId`:

```
Line 202: expect(result).toEqual({ ok: false, reason: 'not-found' })
       -> expect(result).toEqual({ ok: false, reason: 'not-found', jobId: null })

Line 216: same change (not-found)
Line 230: expect(result).toEqual({ ok: false, reason: 'not-failed' })
       -> add ", jobId: null"
Line 251: 'no-args' -> add ", jobId: null"
Line 266: 'capped' -> add ", jobId: null"

Line 282: expect(result).toEqual({ ok: true, reason: null })
       -> expect(result).toEqual({ ok: true, reason: null, jobId: REOPENED_JOB })

Line 417: same as 282 -> add ", jobId: REOPENED_JOB"

Line 456: expect(result).toEqual({ ok: false, reason: 'not-found' })  (delete)
       -> add ", jobId: null"
Line 468: same (delete) -> add ", jobId: null"

Line 504: expect(result).toEqual({ ok: true, reason: null })  (delete)
       -> add ", jobId: null"
```

(Line numbers are current as of this plan; if they've drifted, find each by searching for
`toEqual({ ok`.)

**Step 2: Run the tests to confirm they now fail**

Run: `npx vitest run tests/nina.jobActions.test.ts`
Expected: 6 failures (the ones just edited), each showing the actual object is missing `jobId`.

**Step 3: Implement — widen the interface and thread the value through**

In `lib/nina/jobActions.ts`, change the interface (around line 65):

```ts
export interface NinaJobActionResult {
  ok: boolean
  reason: NinaJobRefusal | null
  /** The new job's id, on a successful `redoNinaImageJob`. `null` on every refusal and on
   * `deleteNinaImageJob`, which never opens a row. */
  jobId: string | null
}
```

In `redoNinaImageJob` (around line 107-127), add `jobId: null` to both refusal returns and thread
the real id through on success:

```ts
export async function redoNinaImageJob(input: { jobId: string }): Promise<NinaJobActionResult> {
  const userId = await requireUserId()

  if (!isValidId(input?.jobId)) return { ok: false, reason: 'not-found', jobId: null }

  const reopened = await reopenNinaImageJob(userId, input.jobId)
  if (!reopened.ok) return { ok: false, reason: reopened.reason, jobId: null }

  fireNinaImageGeneration({
    userId,
    jobId: reopened.jobId,
    purpose: reopened.purpose,
    replyToId: reopened.replyToId,
  })

  revalidatePath(NINA_JOBS_HREF)
  return { ok: true, reason: null, jobId: reopened.jobId }
}
```

In `deleteNinaImageJob` (around line 169-180), add `jobId: null` to all three returns:

```ts
export async function deleteNinaImageJob(input: { jobId: string }): Promise<NinaJobActionResult> {
  const userId = await requireUserId()
  if (!isValidId(input?.jobId)) return { ok: false, reason: 'not-found', jobId: null }

  const deleted = await softDeleteNinaImageJob(userId, input.jobId)
  if (!deleted) return { ok: false, reason: 'not-found', jobId: null }

  revalidatePath(NINA_JOBS_HREF)
  return { ok: true, reason: null, jobId: null }
}
```

**Step 4: Run the tests again**

Run: `npx vitest run tests/nina.jobActions.test.ts`
Expected: all pass (same count as baseline).

**Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. (`NinaJobActions.tsx` destructures only `outcome.ok`/`outcome.reason`, so
it does not need to change.)

**Step 6: Commit**

```bash
git add lib/nina/jobActions.ts tests/nina.jobActions.test.ts
git commit -m "feat(nina): return the new job id from redoNinaImageJob"
```

---

### Task 2: `setNinaImageJobPrompt` — the core DB operation

**Files:**
- Modify: `lib/nina/jobview.ts` (add `NinaPromptEditRefusal` near `NinaJobRefusal`, ~line 207)
- Modify: `lib/nina/imagejobs.ts` (add `setNinaImageJobPrompt`, near `reopenNinaImageJob`, ~line 286)
- Test: `tests/nina.jobActions.test.ts` (new `describe` block — this file already owns the fake
  `db`/`select`/`update` mock that this function needs; no new test file)

**Step 1: Add the refusal type**

In `lib/nina/jobview.ts`, immediately after `export type NinaJobRefusal = ...` (~line 207), add:

```ts
/**
 * The edit-prompt control's own, smaller refusal vocabulary — kept separate from
 * `NinaJobRefusal` so adding it does not force `components/nina/NinaJobActions.tsx`'s
 * `Record<NinaJobRefusal, string>` to grow a case that button can never produce.
 *
 *   · `not-found` — no such job of his (malformed id, foreign id, unknown id, or hidden — one
 *                   answer, same anti-oracle property as `NinaJobRefusal`'s).
 *   · `no-args`   — the row exists but its `args` jsonb is null or not an object — nothing to
 *                   merge the edited prompt into. Three production rows predate the column.
 *   · `empty-prompt` — the trimmed input was blank.
 */
export type NinaPromptEditRefusal = 'not-found' | 'no-args' | 'empty-prompt'
```

**Step 2: Write the failing test**

In `tests/nina.jobActions.test.ts`, add near the bottom (after the delete `describe` blocks), using
the same `dbRows`/`ARGS`/`FAILED_JOB` fixtures already in the file:

```ts
/* ── the prompt edit ───────────────────────────────────────────────────────────────────────── */

describe('setNinaImageJobPrompt', () => {
  it('refuses a blank prompt without touching the database', async () => {
    const imagejobs = await import('@/lib/nina/imagejobs')
    dbRows.select = [{ status: 'failed' }] // armed to succeed; must not be read
    dbRows.update = [{ id: FAILED_JOB }]

    const result = await imagejobs.setNinaImageJobPrompt(USER, FAILED_JOB, '   ')

    expect(result).toEqual({ ok: false, reason: 'empty-prompt' })
  })

  it('reports a foreign or unknown job the same way', async () => {
    const imagejobs = await import('@/lib/nina/imagejobs')
    dbRows.select = []

    const result = await imagejobs.setNinaImageJobPrompt(USER, FAILED_JOB, 'a new prompt')

    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  it('refuses a row whose args are not an editable object', async () => {
    const imagejobs = await import('@/lib/nina/imagejobs')
    for (const args of [null, 'a string', 42]) {
      dbRows.select = [{ args }]
      const result = await imagejobs.setNinaImageJobPrompt(USER, FAILED_JOB, 'a new prompt')
      expect(result).toEqual({ ok: false, reason: 'no-args' })
    }
  })

  it('trims the prompt, keeps every other arg field, and regenerates the sidecar', async () => {
    const imagejobs = await import('@/lib/nina/imagejobs')
    const sidecar = [
      'provider:   openrouter',
      'model:      qwen/qwen-image-3-pro',
      'purpose:    selfie',
      'resolution: 1024x1536 2:3',
      'seed:       4242',
      'reference:  none (RU-18)',
      '',
      '--- prompt as sent ---',
      'a photograph of nina, REJECTED WORD, late afternoon light',
    ].join('\n')
    dbRows.select = [{ args: { ...ARGS, sidecar } }]
    dbRows.update = [{ id: FAILED_JOB }]

    const result = await imagejobs.setNinaImageJobPrompt(
      USER,
      FAILED_JOB,
      '  a photograph of nina, late afternoon light  ',
    )

    expect(result).toEqual({ ok: true })
  })

  it('falls back to the bare prompt as the sidecar when the marker is missing', async () => {
    const imagejobs = await import('@/lib/nina/imagejobs')
    dbRows.select = [{ args: { ...ARGS, sidecar: 'an old, unstructured sidecar' } }]
    dbRows.update = [{ id: FAILED_JOB }]

    const result = await imagejobs.setNinaImageJobPrompt(USER, FAILED_JOB, 'new prompt')

    expect(result).toEqual({ ok: true })
  })

  it('reports not-found when the row disappears between the read and the write', async () => {
    const imagejobs = await import('@/lib/nina/imagejobs')
    dbRows.select = [{ args: { ...ARGS } }]
    dbRows.update = [] // the UPDATE ... RETURNING came back empty

    const result = await imagejobs.setNinaImageJobPrompt(USER, FAILED_JOB, 'new prompt')

    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })
})
```

Note: these tests assert the *outcome*, not the exact bytes the fake `db.update`'s `.set(...)`
received — the fake driver in this file (lines 76-88) does not record call arguments, only what
`.returning()`/`.then()` resolve to. That is consistent with how this file already tests
`reopenNinaImageJob` (it inspects `insertNinaTurn.mock.calls`, a real spy, not the fake `db`). If
you want to additionally assert the exact merged `args` object reaches `db.update(...).set(...)`,
extend the `@/lib/db` mock's `update` branch to record its argument into a hoisted array — do this
only if you find yourself needing it; the outcome-level tests above are sufficient to drive the
implementation.

**Step 3: Run the test file to confirm the new tests fail**

Run: `npx vitest run tests/nina.jobActions.test.ts -t "setNinaImageJobPrompt"`
Expected: FAIL — `imagejobs.setNinaImageJobPrompt is not a function`.

**Step 4: Implement**

In `lib/nina/imagejobs.ts`, add the import (extend the existing `jobview` import line, ~line 20):

```ts
import type { NinaJobRefusal, NinaPromptEditRefusal } from './jobview'
```

Then add, right after `reopenNinaImageJob` (~line 286):

```ts
/** `setNinaImageJobPrompt`'s return — `{ ok: true }` carries nothing else to report. */
export type NinaPromptEditOutcome = { ok: true } | { ok: false; reason: NinaPromptEditRefusal }

/**
 * **The "Ubah prompt" edit: rewrite `args.prompt` on a job that already exists, so a retry can
 * send different words than the ones the provider's content filter just rejected.**
 *
 * Editable regardless of `status` — this is an admin-only debugging control, not gated on
 * `jobCanRedo` the way the retry button itself is (see the design doc). Same owner-scoped WHERE
 * as `reopenNinaImageJob`'s: `userId`, `id`, `kind = 'image'`, `deletedAt IS NULL`.
 *
 * The sidecar is regenerated rather than left stale: `NinaJobDetail` shows
 * `withCostSourceLine(sidecar, costSource) ?? prompt`, which prefers the sidecar whenever one
 * exists — so leaving the OLD sidecar in place after an edit would keep showing the rejected text
 * the runner just tried to fix. `replaceSidecarPrompt` keeps every metadata line
 * (`sidecarText()`'s provider/model/purpose/resolution/seed/reference — none of which changed)
 * and swaps only what comes after `--- prompt as sent ---`.
 */
export async function setNinaImageJobPrompt(
  userId: string,
  jobId: string,
  prompt: string,
): Promise<NinaPromptEditOutcome> {
  const trimmed = prompt.trim()
  if (trimmed === '') return { ok: false, reason: 'empty-prompt' }

  const [row] = await db
    .select({ args: ninaTurns.args })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )

  if (row == null) return { ok: false, reason: 'not-found' }
  if (row.args == null || typeof row.args !== 'object') return { ok: false, reason: 'no-args' }

  const args = row.args as Partial<NinaImageJobArgs>
  const nextArgs = {
    ...args,
    prompt: trimmed,
    sidecar: replaceSidecarPrompt(typeof args.sidecar === 'string' ? args.sidecar : '', trimmed),
  } as NinaImageJobArgs

  const updated = await db
    .update(ninaTurns)
    .set({ args: nextArgs })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )
    .returning({ id: ninaTurns.id })

  if (updated.length === 0) return { ok: false, reason: 'not-found' }
  return { ok: true }
}

/**
 * Keeps `sidecarText()`'s metadata block intact and swaps only the text after
 * `--- prompt as sent ---` for the edited prompt. Falls back to the bare prompt when the marker
 * is missing (an old or malformed sidecar) — `NinaJobDetail`'s own `sidecar ?? prompt`
 * type-honesty arm, applied here instead of there.
 */
function replaceSidecarPrompt(sidecar: string, newPrompt: string): string {
  const marker = '--- prompt as sent ---'
  const idx = sidecar.indexOf(marker)
  if (idx === -1) return newPrompt
  return sidecar.slice(0, idx + marker.length) + '\n' + newPrompt
}
```

**Step 5: Run the tests**

Run: `npx vitest run tests/nina.jobActions.test.ts`
Expected: all pass, including the 6 new ones.

**Step 6: Typecheck**

Run: `npm run typecheck`

**Step 7: Commit**

```bash
git add lib/nina/jobview.ts lib/nina/imagejobs.ts tests/nina.jobActions.test.ts
git commit -m "feat(nina): add setNinaImageJobPrompt, the edit-prompt DB write"
```

---

### Task 3: `updateNinaImageJobPrompt` — the server action wrapper

**Files:**
- Modify: `lib/nina/jobActions.ts` (imports + new export)
- Test: `tests/nina.jobActions.test.ts` (new `describe` block)

**Step 1: Write the failing tests**

Append to `tests/nina.jobActions.test.ts`:

```ts
describe('updateNinaImageJobPrompt authenticates first and refuses before it writes', () => {
  it('calls requireUserId above the shape check', async () => {
    const result = await actions.updateNinaImageJobPrompt({ jobId: 'nope', prompt: 'x' })

    expect(requireUserId).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: false, reason: 'not-found' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('forwards a refusal from setNinaImageJobPrompt verbatim', async () => {
    dbRows.select = []

    const result = await actions.updateNinaImageJobPrompt({ jobId: FAILED_JOB, prompt: 'x' })

    expect(result).toEqual({ ok: false, reason: 'not-found' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('a successful edit revalidates this job’s own detail path', () => {
  it('revalidates /nina/jobs/<id>, not the list', async () => {
    dbRows.select = [{ args: { ...ARGS } }]
    dbRows.update = [{ id: FAILED_JOB }]

    const result = await actions.updateNinaImageJobPrompt({
      jobId: FAILED_JOB,
      prompt: 'edited prompt',
    })

    expect(result).toEqual({ ok: true, reason: null })
    expect(revalidatePath).toHaveBeenCalledWith(`/nina/jobs/${FAILED_JOB}`)
  })
})
```

**Step 2: Run to confirm failure**

Run: `npx vitest run tests/nina.jobActions.test.ts -t "updateNinaImageJobPrompt"`
Expected: FAIL — `actions.updateNinaImageJobPrompt is not a function`.

**Step 3: Implement**

In `lib/nina/jobActions.ts`, widen the `jobview` import (currently
`import { NINA_JOBS_HREF, type NinaJobRefusal } from './jobview'`) to:

```ts
import { NINA_JOBS_HREF, ninaJobHref, type NinaJobRefusal, type NinaPromptEditRefusal } from './jobview'
```

Widen the `imagejobs` import (currently
`import { reopenNinaImageJob, softDeleteNinaImageJob } from './imagejobs'`) to:

```ts
import { reopenNinaImageJob, setNinaImageJobPrompt, softDeleteNinaImageJob } from './imagejobs'
```

Then add, at the end of the file:

```ts
/**
 * **R1 (edit): rewrite this job's `args.prompt`, so the exact same "Coba lagi" button on this same
 * screen sends something the provider's content filter did not just reject.**
 *
 * Revalidates this job's OWN detail path — `ninaJobHref(jobId)` — never `NINA_JOBS_HREF`: the
 * list shows no prompt at all, so there is nothing there for this edit to invalidate.
 */
export async function updateNinaImageJobPrompt(input: {
  jobId: string
  prompt: string
}): Promise<{ ok: boolean; reason: NinaPromptEditRefusal | null }> {
  const userId = await requireUserId()
  if (!isValidId(input?.jobId)) return { ok: false, reason: 'not-found' }

  const outcome = await setNinaImageJobPrompt(userId, input.jobId, input.prompt)
  if (!outcome.ok) return { ok: false, reason: outcome.reason }

  revalidatePath(ninaJobHref(input.jobId))
  return { ok: true, reason: null }
}
```

**Step 4: Run the tests**

Run: `npx vitest run tests/nina.jobActions.test.ts`
Expected: all pass.

**Step 5: Typecheck**

Run: `npm run typecheck`

**Step 6: Commit**

```bash
git add lib/nina/jobActions.ts tests/nina.jobActions.test.ts
git commit -m "feat(nina): add updateNinaImageJobPrompt server action"
```

---

### Task 4: Retry button on the detail page

**Files:**
- Modify: `app/nina/jobs/[id]/page.tsx` (pass `jobId` down)
- Modify: `components/nina/NinaJobActions.tsx` (export `NOTE`)
- Modify: `components/nina/NinaJobDetail.tsx` (new prop, retry button, `RedoIcon`)
- Test: `components/nina/NinaJobDetail.test.tsx`

**Step 1: Export the refusal vocabulary instead of duplicating it**

In `components/nina/NinaJobActions.tsx`, change (~line 76):

```ts
const NOTE: Record<NinaJobRefusal, string> = {
```

to:

```ts
/** Exported so `NinaJobDetail.tsx`'s retry button — same action, same refusals, a different
 * screen — renders the identical Indonesian sentence instead of a second copy that can drift. */
export const NOTE: Record<NinaJobRefusal, string> = {
```

Run `npx vitest run components/nina/NinaJobActions.test.tsx` once after this one-line change — it
should still pass unchanged (nothing about the const's behavior changed, only its visibility).

**Step 2: Write the failing test**

In `components/nina/NinaJobDetail.test.tsx`:

1. Add the mock at the top of the file (before the `NinaJobDetail` import), following
   `NinaJobActions.test.tsx`'s exact pattern:

```ts
const { redoNinaImageJob } = vi.hoisted(() => ({ redoNinaImageJob: vi.fn() }))
vi.mock('@/lib/nina/jobActions', () => ({ redoNinaImageJob }))

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))
```

2. Add `jobId: 'job-1'` to the `props()` fixture's returned object.

3. Add `beforeEach` (the file currently has none):

```ts
beforeEach(() => {
  redoNinaImageJob.mockReset().mockResolvedValue({ ok: true, reason: null, jobId: 'job-2' })
  routerPush.mockReset()
})
```

(add `beforeEach` to the existing `import { describe, expect, it } from 'vitest'` line ->
`import { beforeEach, describe, expect, it } from 'vitest'`)

4. Add new tests, in the same file, using `userEvent` (add
   `import userEvent from '@testing-library/user-event'` and change the `@testing-library/react`
   import to include `waitFor`):

```ts
it('a failed job draws a retry control; a done one does not', () => {
  const { unmount } = render(<NinaJobDetail {...props({ stage: 'failed', stageLabel: 'Gagal' })} />)
  expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
  unmount()

  render(<NinaJobDetail {...props({ stage: 'done' })} />)
  expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument()
})

it('a tap retries this job and lands on the new job’s own detail page', async () => {
  const user = userEvent.setup()
  render(<NinaJobDetail {...props({ stage: 'failed', stageLabel: 'Gagal' })} />)

  await user.click(screen.getByRole('button', { name: 'Coba lagi' }))

  await waitFor(() => expect(redoNinaImageJob).toHaveBeenCalledWith({ jobId: 'job-1' }))
  await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/nina/jobs/job-2'))
})

it('a refusal renders its sentence and never navigates', async () => {
  redoNinaImageJob.mockResolvedValue({ ok: false, reason: 'capped', jobId: null })
  const user = userEvent.setup()
  render(<NinaJobDetail {...props({ stage: 'failed', stageLabel: 'Gagal' })} />)

  await user.click(screen.getByRole('button', { name: 'Coba lagi' }))

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Jatah foto hari ini sudah habis. Coba lagi besok ya.',
  )
  expect(routerPush).not.toHaveBeenCalled()
})
```

**Step 3: Run to confirm failure**

Run: `npx vitest run components/nina/NinaJobDetail.test.tsx`
Expected: the three new tests fail (`jobId` prop doesn't exist yet / no button named "Coba lagi").
The existing tests should still pass once you've added the `jobId` field to `props()` — if any
existing test breaks from that addition alone, stop and check `Props` derives from
`Parameters<typeof NinaJobDetail>[0]`, which will only fail to typecheck (not break at runtime)
until Step 4 below adds the prop.

**Step 4: Implement**

In `app/nina/jobs/[id]/page.tsx`, add `jobId={job.id}` to the `<NinaJobDetail>` call (~line 104):

```tsx
<NinaJobDetail
  jobId={job.id}
  stage={stage}
  ...
```

In `components/nina/NinaJobDetail.tsx`:

1. Extend imports (~lines 1-13):

```tsx
'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button, ButtonLink, Card, Stat } from '@/components/ui'
import { redoNinaImageJob } from '@/lib/nina/jobActions'
import {
  NINA_JOB_JUMP_NOTE,
  formatJobLatency,
  formatMicroUsd,
  jobCanRedo,
  ninaJobHref,
  withCostSourceLine,
  type NinaJobJump,
  type NinaJobPhoto,
  type NinaJobStage,
} from '@/lib/nina/jobview'
import { NOTE } from './NinaJobActions'
import { NinaJobElapsed } from './NinaJobElapsed'
```

2. Add `jobId: string` to the props type (first line of the destructured prop list and its type,
   ~lines 64-110):

```tsx
export function NinaJobDetail({
  jobId,
  stage,
  ...
}: {
  jobId: string
  stage: NinaJobStage
  ...
```

3. Inside the function body, before the `return` (~line 111, right after
   `const open = stage === 'queued' || ...`):

```tsx
const router = useRouter()
const [retryNote, setRetryNote] = React.useState<string | null>(null)
const [retryPending, startRetryTransition] = React.useTransition()

function retry() {
  setRetryNote(null)
  startRetryTransition(async () => {
    const outcome = await redoNinaImageJob({ jobId })
    if (!outcome.ok || outcome.jobId == null) {
      setRetryNote(NOTE[outcome.reason ?? 'not-found'])
      return
    }
    router.push(ninaJobHref(outcome.jobId))
  })
}
```

4. Add the retry button as a third child of the icon row (~lines 155-181), right after the
   `photo.kind === 'ready'` block, and the refusal note right after that `</div>`:

```tsx
          {jobCanRedo(stage) && (
            <Button
              variant="secondary"
              size="md"
              loading={retryPending}
              aria-label="Coba lagi"
              onClick={retry}
            >
              <RedoIcon />
            </Button>
          )}
        </div>
        {retryNote !== null && (
          <p role="status" className="mt-2 text-[12px] font-semibold text-red">
            {retryNote}
          </p>
        )}
      </Card>
```

5. Add `RedoIcon` at the bottom of the file, copied verbatim from
   `components/nina/NinaJobActions.tsx`'s own (same glyph, same reasoning — a retry on this screen
   is the same verb):

```tsx
/** "Coba lagi" — `NinaJobActions.tsx`'s `RedoIcon`, copied verbatim: same glyph, same verb, a
 * different screen. `aria-hidden`, because the button already carries the accessible name. */
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

**Step 5: Run the tests**

Run: `npx vitest run components/nina/NinaJobDetail.test.tsx components/nina/NinaJobActions.test.tsx`
Expected: all pass.

**Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`

**Step 7: Commit**

```bash
git add app/nina/jobs/[id]/page.tsx components/nina/NinaJobActions.tsx components/nina/NinaJobDetail.tsx components/nina/NinaJobDetail.test.tsx
git commit -m "feat(nina): add a retry control to the job detail page"
```

---

### Task 5: Edit-prompt button on the detail page

**Files:**
- Modify: `components/nina/NinaJobDetail.tsx`
- Test: `components/nina/NinaJobDetail.test.tsx`

**Step 1: Write the failing tests**

In `components/nina/NinaJobDetail.test.tsx`:

1. Extend the hoisted mock from Task 4 to include the new action:

```ts
const { redoNinaImageJob, updateNinaImageJobPrompt } = vi.hoisted(() => ({
  redoNinaImageJob: vi.fn(),
  updateNinaImageJobPrompt: vi.fn(),
}))
vi.mock('@/lib/nina/jobActions', () => ({ redoNinaImageJob, updateNinaImageJobPrompt }))
```

2. Reset it in `beforeEach`:

```ts
updateNinaImageJobPrompt.mockReset().mockResolvedValue({ ok: true, reason: null })
```

3. New tests:

```ts
it('the pencil opens an editable textarea prefilled with the bare prompt, never the sidecar', async () => {
  const user = userEvent.setup()
  render(<NinaJobDetail {...props()} />)

  await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))

  expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
    'sebuah foto selfie di pantai',
  )
})

it('Batal discards the draft and returns to the read-only view untouched', async () => {
  const user = userEvent.setup()
  render(<NinaJobDetail {...props()} />)
  await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))
  await user.clear(screen.getByRole('textbox', { name: 'Prompt' }))
  await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'a different draft')

  await user.click(screen.getByRole('button', { name: 'Batal' }))

  expect(screen.queryByRole('textbox', { name: 'Prompt' })).not.toBeInTheDocument()
  expect(updateNinaImageJobPrompt).not.toHaveBeenCalled()
  expect(screen.getByText(/--- prompt as sent ---/)).toBeInTheDocument()
})

it('Simpan saves the trimmed draft for THIS job and returns to the read-only view', async () => {
  const user = userEvent.setup()
  render(<NinaJobDetail {...props()} />)
  await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))
  await user.clear(screen.getByRole('textbox', { name: 'Prompt' }))
  await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '  no nsfw words here  ')

  await user.click(screen.getByRole('button', { name: 'Simpan' }))

  await waitFor(() =>
    expect(updateNinaImageJobPrompt).toHaveBeenCalledWith({
      jobId: 'job-1',
      prompt: '  no nsfw words here  ',
    }),
  )
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Prompt' })).not.toBeInTheDocument(),
  )
})

it('a save refusal keeps the textarea open and shows the sentence', async () => {
  updateNinaImageJobPrompt.mockResolvedValue({ ok: false, reason: 'empty-prompt' })
  const user = userEvent.setup()
  render(<NinaJobDetail {...props()} />)
  await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))

  await user.click(screen.getByRole('button', { name: 'Simpan' }))

  expect(await screen.findByRole('status')).toHaveTextContent(/kosong/i)
  expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeInTheDocument()
})

it('while editing, the retry control is hidden', async () => {
  const user = userEvent.setup()
  render(<NinaJobDetail {...props({ stage: 'failed', stageLabel: 'Gagal' })} />)
  expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))

  expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument()
})
```

**Step 2: Run to confirm failure**

Run: `npx vitest run components/nina/NinaJobDetail.test.tsx`
Expected: the new tests fail (no "Ubah prompt" button exists yet).

**Step 3: Implement**

In `components/nina/NinaJobDetail.tsx`:

1. Add `updateNinaImageJobPrompt` to the `jobActions` import (from Task 4):

```tsx
import { redoNinaImageJob, updateNinaImageJobPrompt } from '@/lib/nina/jobActions'
```

2. Add local state and the save/edit handlers, beside the retry ones from Task 4:

```tsx
const [mode, setMode] = React.useState<'view' | 'edit'>('view')
const [draft, setDraft] = React.useState('')
const [editNote, setEditNote] = React.useState<string | null>(null)
const [editPending, startEditTransition] = React.useTransition()

const EDIT_NOTE: Record<'not-found' | 'no-args' | 'empty-prompt', string> = {
  'not-found': 'Job ini sudah nggak ada.',
  'no-args': 'Job ini nggak nyimpan argumen buat diubah.',
  'empty-prompt': 'Prompt-nya nggak boleh kosong.',
}

function openEdit() {
  setDraft(prompt ?? '')
  setEditNote(null)
  setMode('edit')
}

function cancelEdit() {
  setMode('view')
  setEditNote(null)
}

function saveEdit() {
  setEditNote(null)
  startEditTransition(async () => {
    const outcome = await updateNinaImageJobPrompt({ jobId, prompt: draft })
    if (!outcome.ok) {
      setEditNote(EDIT_NOTE[outcome.reason ?? 'not-found'])
      return
    }
    setMode('view')
  })
}
```

(Move `EDIT_NOTE` to module scope, above the component, rather than re-creating the object on
every render — same placement as `NinaJobActions.tsx`'s own `NOTE`.)

3. Gate the retry button from Task 4 on `mode === 'view'` too:

```tsx
{mode === 'view' && jobCanRedo(stage) && (
  <Button ...>
```

4. Replace the "Catatan foto" `Card` body (~lines 203-227) with:

```tsx
<Card className="p-5">
  <div className="mb-2 flex items-center justify-between gap-2">
    <h2 className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
      Catatan foto
    </h2>
    {mode === 'view' && (
      <Button variant="secondary" size="md" aria-label="Ubah prompt" onClick={openEdit}>
        <PencilIcon />
      </Button>
    )}
  </div>

  {mode === 'edit' ? (
    <div>
      <textarea
        aria-label="Prompt"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={6}
        className="w-full resize-y rounded-field border border-rule bg-paper-2 px-3 py-2 text-[13px] leading-[1.55] font-medium text-ink-2"
      />
      {editNote !== null && (
        <p role="status" className="mt-2 text-[12px] font-semibold text-red">
          {editNote}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="md" loading={editPending} onClick={saveEdit}>
          Simpan
        </Button>
        <Button variant="ghost" size="md" disabled={editPending} onClick={cancelEdit}>
          Batal
        </Button>
      </div>
    </div>
  ) : sidecar === null && prompt === null ? (
    <p className="text-[13px] font-medium text-ink-3">
      Job ini nggak nyimpen catatan fotonya — barisnya dibuat sebelum catatan itu ada.
    </p>
  ) : (
    <p className="text-[13px] leading-[1.55] font-medium whitespace-pre-wrap text-ink-2">
      {withCostSourceLine(sidecar, costSource) ?? prompt}
    </p>
  )}
</Card>
```

5. Add `PencilIcon` at the bottom of the file, copied verbatim from
   `components/nina/SessionRow.tsx`'s own:

```tsx
/** "Ubah prompt" — `SessionRow.tsx`'s `PencilIcon`, copied verbatim. `aria-hidden`: the button
 * already carries the accessible name. */
function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}
```

**Step 4: Run the tests**

Run: `npx vitest run components/nina/NinaJobDetail.test.tsx`
Expected: all pass.

**Step 5: Typecheck**

Run: `npm run typecheck`

**Step 6: Commit**

```bash
git add components/nina/NinaJobDetail.tsx components/nina/NinaJobDetail.test.tsx
git commit -m "feat(nina): add an edit-prompt control to the job detail page"
```

---

### Task 6: Full verification pass

**No new code** — this task is the gate before the branch is considered done.

**Step 1: Full unit suite**

Run: `npm test`
Expected: 100% pass, count higher than the 6384-test baseline recorded when this worktree was set
up.

**Step 2: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: clean. Fix anything `npm run lint:fix` / `npm run format` can't fix automatically by
hand, then re-run.

**Step 3: The seven CI guards**

Run: `npm run ci:data-layer-guard`
Expected: clean — this change never imports `db`/`ninaTurns`/Drizzle into a client component or
into `lib/nina/tools.ts`'s handler layer, so it should not trip. If it does, read the guard's
specific complaint before changing anything; do not silence it.

**Step 4: Build**

Run: `npm run build`
Expected: clean. This is the real typecheck-adjacent gate per this repo's own `CLAUDE.md`
("`npm run build` — next build — the real typecheck gate lives in `typecheck`, not this"), and it
also catches anything `next typegen` needed for the new `PageProps` usage.

**Step 5: Manual smoke test — READ THIS BEFORE RUNNING `npm run dev`**

**This repository has exactly one database, and it is production** (`CLAUDE.md`'s own words:
`.env.local`'s `DATABASE_URL` is production; there is no dev/staging instance). `npm run dev` in
this worktree talks to the real Neon database and the real OpenRouter billing account. Concretely:

- Opening `/nina/jobs/[id]` for a real failed job and clicking the pencil, editing the prompt, and
  clicking **Simpan** is safe — it is a single `UPDATE ... SET args = ...` on one row, the same
  blast radius as the existing "Hapus" button already in production.
- Clicking **Coba lagi** (the new retry button) is NOT safe to do casually — it opens a real new
  `nina_turns` row, fires a real `after()` job, and spends one of the six-a-day generations plus
  real OpenRouter money, exactly like the existing list-page retry button already does. Only click
  it if you intend to actually spend a generation verifying the end-to-end flow, on a job you are
  fine burning quota on.

Recommended smoke test: find (or create, via the existing flow) one real failed job with
`errorCode: 'policy'`. Open its detail page, confirm the "Ditolak filter konten provider" banner
and the pencil button both render, edit the prompt, save, confirm the read-only text updates to
the new prompt (not the old sidecar). Stop there unless you deliberately want to also verify the
retry button lands you on the new job's own detail page.

**Step 6: Commit anything Step 2's autofixes touched, if not already committed**

```bash
git status
# if format/lint fixed anything not yet committed:
git add -A
git commit -m "chore: apply format/lint fixes"
```

---

## After all tasks: merge

Once Task 6 is green, this is a small, single-purpose branch. Use the
`superpowers-extended-cc:finishing-a-development-branch` skill to decide how to land it (this repo
has no PR process visible in its own `CLAUDE.md`/`AGENTS.md` beyond `npm run` gates, so a direct
merge to `main` from the worktree, followed by deleting the worktree and branch, is likely the
right call — confirm with the user before merging or deleting anything, per this session's own
standing instructions about destructive/shared-state actions).
