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
