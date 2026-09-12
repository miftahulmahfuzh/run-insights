import { readFileSync, readdirSync } from 'node:fs'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NINA_DESCRIPTION_UNAVAILABLE } from '@/lib/nina/prompts/describe'

/**
 * **G3: a dead chat turn is revived by the act of opening its session — bounded, suppressed, and
 * never at the render's expense.**
 *
 * Seven properties, in the order they would hurt if they were wrong:
 *
 *   1. **The revive runs the turn when the newest row is his and the claim was swept** — sweep,
 *      ONE claim at `depth: 0` against the newest row's id, and exactly ONE task handed to
 *      `after()` whose drain carries the row-rebuilt input.
 *   2. **A live turn suppresses it.** `openNinaChatTurn`'s fresh-claim refusal is the whole
 *      mechanism — the revive adds no second claim read of its own.
 *   3. **Her bubble on top suppresses it** — the last thing that happened was an answer. The
 *      arrival sweep still ran: that part is unconditional ledger hygiene.
 *   4. **The cap stops the spend.** Three prior attempts per message (the send included) and the
 *      revive opens nothing and schedules nothing — while two still revive, so the cap is the
 *      second revive's allowance and not an off-by-one.
 *   5. **A failed count read degrades OPEN** — `chatTurnWasSuperseded`'s rule: a duplicate costs
 *      less than a lost reply, and the open's refusal is the safety net.
 *   6. **It can never take the render down.** Every read's failure resolves 0 instead of throwing.
 *   7. **Invariant 4 held through the move.** `turnrun.ts` and `turnrevive.ts` are `'server-only'`
 *      and neither is a Server Action module; the `lib/nina/actions/` modules declare no runner
 *      and the barrel still exports the `SentBubble` type `ChatScreen` imports.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `next/server`, `@/lib/db`, `@/lib/nina/queries`, `@/lib/nina/chatturn` and — to DRAIN the
 * deferred turn — `@/lib/nina/load`, `@/lib/nina/gateway`, `@/lib/nina/turn`, `@/lib/nina/distill`
 * and `@/lib/nina/autotitle`. `turnrevive.ts` and `turnrun.ts` are the real modules under test,
 * which is the point: `tests/nina.resend.test.ts` established this exact arrangement and its
 * reason applies verbatim — mocking the module under test would make every property above
 * untestable.
 */

/* ── the edges ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `vi.hoisted`, because `vi.mock`'s factory is lifted above every declaration in this file.
 * `deferred` collects what the revive hands `after()`; `dbRows` backs the ONE raw read this
 * feature makes — the attempt-count walk over `nina_turns` — with `failAttempts` as its fault
 * injector.
 */
const { deferred, dbRows } = vi.hoisted(() => ({
  deferred: [] as Array<() => unknown>,
  dbRows: { attempts: [] as unknown[], failAttempts: false },
}))

vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

vi.mock('@/lib/db', () => {
  /* The drizzle chain the revive builds: select → from → where → orderBy → limit → await. The
   * two-line thenable is `tests/nina.jobActions.test.ts`'s stand-in, one `.orderBy()` deeper. */
  const thenable = () => ({
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      (dbRows.failAttempts
        ? Promise.reject(new Error('neon: connection reset'))
        : Promise.resolve(dbRows.attempts)
      ).then(ok, err),
  })
  return {
    db: {
      select: () => ({
        from: () => ({ where: () => ({ orderBy: () => ({ limit: () => thenable() }) }) }),
      }),
    },
  }
})

const getPendingNinaChatTurn = vi.fn()
const insertNinaMessages = vi.fn()
const listNinaMessages = vi.fn()
const getNinaMessagesByIds = vi.fn()
const getNinaMessageImagesForMessages = vi.fn()

vi.mock('@/lib/nina/queries', () => ({
  /* Every name the two real modules import. A missing one is an import error, not an undefined. */
  bumpNinaShortcutUses: vi.fn(),
  getNinaMessageImagesForMessages: (...a: unknown[]) => getNinaMessageImagesForMessages(...a),
  getNinaMessagesByIds: (...a: unknown[]) => getNinaMessagesByIds(...a),
  insertNinaMessages: (...a: unknown[]) => insertNinaMessages(...a),
  listNinaMessages: (...a: unknown[]) => listNinaMessages(...a),
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: vi.fn(),
}))

const openNinaChatTurn = vi.fn()
const sweepStaleNinaChatTurns = vi.fn()
const chatTurnWasSuperseded = vi.fn()
const closeNinaChatTurn = vi.fn()
const ninaSessionExists = vi.fn()

vi.mock('@/lib/nina/chatturn', () => ({
  chatTurnWasSuperseded: (...a: unknown[]) => chatTurnWasSuperseded(...a),
  closeNinaChatTurn: (...a: unknown[]) => closeNinaChatTurn(...a),
  getPendingNinaChatTurn: (...a: unknown[]) => getPendingNinaChatTurn(...a),
  ninaChatTurnStore: () => ({ record: vi.fn() }),
  ninaSessionExists: (...a: unknown[]) => ninaSessionExists(...a),
  openNinaChatTurn: (...a: unknown[]) => openNinaChatTurn(...a),
  supersedeNinaChatTurn: vi.fn(),
  sweepStaleNinaChatTurns: (...a: unknown[]) => sweepStaleNinaChatTurns(...a),
}))

/* The drained turn's own edges — the resend suite's arrangement, for the same reason. */
const loadNinaContext = vi.fn()
const runNinaTurn = vi.fn()

vi.mock('@/lib/nina/load', () => ({ loadNinaContext: (...a: unknown[]) => loadNinaContext(...a) }))
vi.mock('@/lib/nina/gateway', () => ({
  dbNinaSourceGateway: {},
  dbNinaToolGateway: { loadRunHistory: () => Promise.resolve([]) },
}))
vi.mock('@/lib/nina/turn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/turn')>()
  return {
    ...actual,
    /* Everything real EXCEPT the model call and the production deps. `runNinaTurn` answers
     * `payload: null` — the honest "she could not answer" — so the drain writes no rows of hers
     * and property 7's sibling assertion stays clean end to end. */
    productionDeps: () => ({}),
    runNinaTurn: (...a: unknown[]) => runNinaTurn(...a),
  }
})
vi.mock('@/lib/nina/distill', () => ({ runTurnDistillation: vi.fn() }))
vi.mock('@/lib/nina/autotitle', () => ({ titleNinaSessionIfNeeded: vi.fn() }))

/* ── the fixture ───────────────────────────────────────────────────────────────────────────── */

const USER = 'u1'
/** 12 chars, so `isValidId` would pass if one were checked. */
const HIS = 'msgrunner001'
const HERS = 'msgnina00001'
const QUOTED = 'msgquoted001'
const SESSION = 'ses000000001'
const TURN = 'turn00000001'
const RUN = 'run000000001'

/** The one row the newest-row read comes back with. `messageColumns`' shape. */
function runnerRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: HIS,
    seq: 40,
    sessionId: SESSION,
    role: 'runner' as const,
    body: 'lari gw kemaren gimana menurut lo?',
    createdAt: new Date('2026-09-10T01:14:00.000Z'),
    source: 'chat' as const,
    turnId: null,
    replyToId: null,
    runId: null,
    readAt: null,
    photoOnly: false,
    ...over,
  }
}

type TurnRevive = typeof import('@/lib/nina/turnrevive')
let revive: TurnRevive

beforeEach(async () => {
  deferred.length = 0
  vi.clearAllMocks()
  /* One prior attempt — the original send's dead claim — is the ordinary arrive-and-revive state. */
  dbRows.attempts = [{ id: TURN }]
  dbRows.failAttempts = false

  listNinaMessages.mockResolvedValue([runnerRow()])
  getNinaMessagesByIds.mockResolvedValue([])
  getNinaMessageImagesForMessages.mockResolvedValue([])
  openNinaChatTurn.mockResolvedValue(TURN)
  sweepStaleNinaChatTurns.mockResolvedValue(0)
  chatTurnWasSuperseded.mockResolvedValue(false)
  closeNinaChatTurn.mockResolvedValue(undefined)
  ninaSessionExists.mockResolvedValue(true)
  loadNinaContext.mockResolvedValue({ conversation: { window: [] } })
  runNinaTurn.mockResolvedValue({ source: 'unavailable', payload: null, firedShortcutIds: [] })

  revive = await import('@/lib/nina/turnrevive')
})

/* ── the revive, the suppression, the cap ──────────────────────────────────────────────────── */

describe('reviveNinaChatTurn', () => {
  it('does nothing at all for a render with no active session', async () => {
    await expect(revive.reviveNinaChatTurn(USER, null)).resolves.toBe(0)

    expect(sweepStaleNinaChatTurns).not.toHaveBeenCalled()
    expect(listNinaMessages).not.toHaveBeenCalled()
    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('runs the turn when the newest row is his: sweep, ONE claim at depth 0, one task', async () => {
    const revived = await revive.reviveNinaChatTurn(USER, SESSION)

    expect(revived).toBe(1)
    expect(sweepStaleNinaChatTurns).toHaveBeenCalledTimes(1)
    expect(sweepStaleNinaChatTurns).toHaveBeenCalledWith(USER, expect.any(Date))
    expect(listNinaMessages).toHaveBeenCalledWith(USER, { limit: 1, sessionId: SESSION })
    expect(openNinaChatTurn).toHaveBeenCalledOnce()
    expect(openNinaChatTurn).toHaveBeenCalledWith(USER, {
      sessionId: SESSION,
      runnerMessageId: HIS,
      depth: 0,
    })
    /* THE after-queue receives exactly one task. */
    expect(deferred).toHaveLength(1)
  })

  it('rebuilds the turn input from the row: his text, his photos, his quote, his run', async () => {
    listNinaMessages.mockResolvedValue([runnerRow({ replyToId: QUOTED, runId: RUN })])
    getNinaMessagesByIds.mockResolvedValue([
      runnerRow({ id: QUOTED, seq: 12, role: 'nina', body: 'gimana?' }),
    ])
    getNinaMessageImagesForMessages.mockResolvedValue([
      { id: 'img000000001', description: 'a man in a blue singlet, mid-stride', sortOrder: 0 },
      /* An undescribed row: the vision pass failed, or has not run. */
      { id: 'img000000002', description: null, sortOrder: 1 },
    ])

    await revive.reviveNinaChatTurn(USER, SESSION)
    expect(deferred).toHaveLength(1)
    /* The chain inside the drained turn re-reads the newest row and, if it is still HIS, opens
     * another claim and re-fires `runNinaTurn` down to `NINA_TURN_CHAIN_MAX` — three calls, not
     * one. The revive has already consumed its candidate read, so re-pointing the mock at HER row
     * here only affects the drain, whose chain read then exits on `role !== 'runner'`. This is the
     * resend suite's own fixture (tests/nina.resend.test.ts mocks her row as newest for exactly
     * this reason). */
    listNinaMessages.mockResolvedValue([runnerRow({ id: HERS, seq: 57, role: 'nina' })])
    await deferred[0]!()

    expect(runNinaTurn).toHaveBeenCalledOnce()
    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]
    expect(turnInput.sourceMessageId).toBe(HIS)
    expect(turnInput.runnerText).toBe('lari gw kemaren gimana menurut lo?')
    expect(turnInput.attachedRunId).toBe(RUN)
    expect((turnInput.quoted as { id: string } | null)?.id).toBe(QUOTED)
    const descriptions = turnInput.imageDescriptions as readonly string[]
    /* The substitution is the resend's: an undescribed photograph becomes the honest sentence. */
    expect(descriptions).toHaveLength(2)
    expect(descriptions[0]).toBe('a man in a blue singlet, mid-stride')
    expect(descriptions[1]).toBe(NINA_DESCRIPTION_UNAVAILABLE)

    /* Nothing of HIS was written by the revive or the drained turn — she said nothing. */
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('skips a row that has nothing for her to answer', async () => {
    listNinaMessages.mockResolvedValue([runnerRow({ body: '   ' })])
    getNinaMessageImagesForMessages.mockResolvedValue([])

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(0)

    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('is suppressed when the newest row is hers, though the arrival sweep still ran', async () => {
    listNinaMessages.mockResolvedValue([runnerRow({ id: HERS, seq: 57, role: 'nina' })])

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(0)

    expect(sweepStaleNinaChatTurns).toHaveBeenCalledTimes(1)
    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('is suppressed while a fresh claim lives, and reads the claim only through the open', async () => {
    /* `openNinaChatTurn` returning null IS the fresh-claim refusal (`chatturn.ts:161`). */
    openNinaChatTurn.mockResolvedValue(null)

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(0)

    expect(openNinaChatTurn).toHaveBeenCalledOnce()
    expect(deferred).toHaveLength(0)
    /* No duplicated claim read: the open's own refusal is the suppression, so the revive never
     * calls `getPendingNinaChatTurn` itself. */
    expect(getPendingNinaChatTurn).not.toHaveBeenCalled()
  })

  it('opens no claim and schedules nothing once the cap of three attempts is reached', async () => {
    dbRows.attempts = [{ id: 't1' }, { id: 't2' }, { id: 't3' }]

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(0)

    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('still revives at two attempts — the second revive is the cap’s allowance, not an off-by-one', async () => {
    dbRows.attempts = [{ id: 't1' }, { id: 't2' }]

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(1)

    expect(openNinaChatTurn).toHaveBeenCalledOnce()
    expect(deferred).toHaveLength(1)
  })

  it('degrades OPEN when the count read fails, because lost replies are the worse outcome', async () => {
    dbRows.failAttempts = true

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(1)

    expect(openNinaChatTurn).toHaveBeenCalledOnce()
    expect(deferred).toHaveLength(1)
  })
})

/* ── the render's bodyguard ────────────────────────────────────────────────────────────────── */

describe('a recovery path can never take the render down with it', () => {
  it('resolves 1 when the sweep throws — the open still applies staleness itself', async () => {
    sweepStaleNinaChatTurns.mockRejectedValue(new Error('neon: statement timeout'))

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(1)
    expect(openNinaChatTurn).toHaveBeenCalledOnce()
  })

  it('resolves 0 when the newest-row read throws, and schedules nothing', async () => {
    listNinaMessages.mockRejectedValue(new Error('neon: connection reset'))

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(0)
    expect(openNinaChatTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })

  it('resolves 0 when the open throws, and schedules nothing', async () => {
    openNinaChatTurn.mockRejectedValue(new Error('neon: connection reset'))

    await expect(revive.reviveNinaChatTurn(USER, SESSION)).resolves.toBe(0)
    /* The open throwing IS the scenario — step (g) called it once and swallowed the throw. What
     * the bodyguard asserts is the swallow: no task reached `after()`. */
    expect(openNinaChatTurn).toHaveBeenCalledOnce()
    expect(deferred).toHaveLength(0)
  })
})

/* ── invariant 4, asserted against the sources the move produced ───────────────────────────── */

describe('the move left the action surface exactly as wide as it was', () => {
  it('turnrun.ts and turnrevive.ts are server-only and neither is a Server Action module', () => {
    for (const path of ['lib/nina/turnrun.ts', 'lib/nina/turnrevive.ts']) {
      const source = readFileSync(path, 'utf8')
      expect(source.trimStart().startsWith("import 'server-only'"), path).toBe(true)
      /* A `'use server'` directive is only effective as the module's FIRST statement, so that is
       * what is checked — `includes` would false-trip on prose that QUOTES the directive, which
       * `turnrun.ts`'s own header legitimately does. */
      expect(source.trimStart().startsWith("'use server'"), path).toBe(false)
    }
  })

  it('the action modules never declare the runner, and the barrel still exports the SentBubble type', () => {
    /* `lib/nina/actions.ts` split per concern (2026-09-12): the assertion walks every module the
     * split produced rather than one file, so no concern module can quietly grow its own runner
     * copy either. The SentBubble re-export stays pinned to the barrel — the public address
     * `ChatScreen` imports the type from. */
    const actionModules = readdirSync('lib/nina/actions').map((name) => `lib/nina/actions/${name}`)
    expect(actionModules.length).toBeGreaterThan(0)
    for (const path of actionModules) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/function runNinaBackgroundTurn\(/)
    }
    expect(readFileSync('lib/nina/actions/index.ts', 'utf8')).toMatch(
      /export type \{ SentBubble \}/,
    )
  })
})
