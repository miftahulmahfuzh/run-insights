import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from '@/tests/support/fakeDb'

/**
 * **The chat claim's state machine, asserted against the SQL it actually issues.**
 *
 * Three properties this feature lives or dies by, and each is one WHERE clause:
 *
 *   1. **The cancel is conditional.** `supersedeNinaChatTurn`'s UPDATE carries
 *      `status='pending' AND error_code='running'` in its own WHERE, so it can only ever win a row
 *      that is still THINKING — never one that reached `'persisting'`, and never a stale one.
 *   2. **The phase advance is conditional.** `ninaChatTurnStore.record`'s first arm carries
 *      `status='pending'`; when it advances nothing, a metrics-only arm runs whose SET names
 *      neither `status` nor `error_code` — a superseded reason cannot be overwritten because the
 *      statement never writes the column.
 *   3. **"Superseded" is a narrow state.** `chatTurnWasSuperseded` is true for exactly
 *      `failed`+`superseded` — never for `'stale'`, `'crashed'`, `'ok'`, or a missing row.
 */

const USER = 'u1'
const SESSION = 'ses000000001'
const TURN = 'turn00000001'

/** A `getPendingNinaChatTurn` row, in projection order: id, created_at, error_code, args. */
function claimRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    overrides.id ?? TURN,
    overrides.createdAt ?? new Date(Date.now() - 5_000).toISOString(),
    overrides.errorCode ?? 'running',
    overrides.args ?? { sessionId: SESSION, runnerMessageId: 'msg000000001', depth: 0 },
  )
}

/** A `NinaTurnRow` as `runNinaTurn` builds it — every field `record` writes. */
function turnRow() {
  return {
    model: 'glm-5.3',
    promptVersion: 7,
    source: 'llm' as const,
    toolCalls: '',
    inputTokens: 1_234,
    outputTokens: 567,
    latencyMs: 13_000,
  }
}

/** Splits a generated UPDATE into its SET and WHERE halves for predicate-level assertions. */
function setAndWhere(sql: string): { set: string; where: string } {
  const whereAt = sql.indexOf(' where ')
  return { set: sql.slice(sql.indexOf(' set '), whereAt), where: sql.slice(whereAt) }
}

type Chatturn = typeof import('./chatturn')
let chatturn: Chatturn
let fake: FakeDb

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  /* Dynamic on purpose: `lib/db/index.ts` builds its client at import, so the fake must be in
   * place first. `tests/db.queries.*.test.ts` established this arrangement. */
  chatturn = await import('./chatturn')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('supersedeNinaChatTurn — the atomic cancel', () => {
  it('wins a fresh running claim and closes it failed/superseded', async () => {
    fake.enqueue([claimRow()], [[TURN]])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(true)

    expect(fake.queries).toHaveLength(2)
    const update = fake.last()
    const { set, where } = setAndWhere(update.sql)
    expect(set).toContain('"error_code"')
    expect(update.params).toContain('failed')
    expect(update.params).toContain('superseded')
    /* THE RACE, DECIDED IN THE STATEMENT: the WHERE re-asserts the whole cancellable window. */
    expect(where).toContain('"nina_turns"."status"')
    expect(where).toContain('"nina_turns"."error_code"')
    expect(where).toContain('"nina_turns"."created_at"')
    expect(update.params).toContain('pending')
    expect(update.params).toContain('running')
    /* The freshness bound rides the params as a real timestamp — the driver serializes the
     * call-site `Date` to its ISO string before it reaches the client. */
    expect(update.params).toEqual(
      expect.arrayContaining([expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)]),
    )
  })

  it('does not attempt a cancel when no claim is live', async () => {
    fake.enqueue([])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(false)
    expect(fake.queries).toHaveLength(1)
    expect(fake.only().sql).toMatch(/select/i)
  })

  it('does not attempt a cancel once she is persisting', async () => {
    fake.enqueue([claimRow({ errorCode: 'persisting' })])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(false)
    expect(fake.queries).toHaveLength(1)
  })

  it('does not attempt a cancel on an expired claim — the sweep owns that row', async () => {
    fake.enqueue([claimRow({ createdAt: new Date(Date.now() - 120_000).toISOString() })])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(false)
    expect(fake.queries).toHaveLength(1)
  })

  it('answers false when the UPDATE races and misses — the loss is seen, not assumed', async () => {
    /* The read found a fresh running claim, but the row left `pending` before the UPDATE ran. */
    fake.enqueue([claimRow()], [])

    await expect(chatturn.supersedeNinaChatTurn(USER, SESSION)).resolves.toBe(false)
    expect(fake.queries).toHaveLength(2)
  })
})

describe('ninaChatTurnStore().record — the conditional phase advance', () => {
  it('advances a live claim to persisting, with the metrics, under status = pending', async () => {
    fake.enqueue([[TURN]])

    await chatturn.ninaChatTurnStore(TURN).record(USER, turnRow())

    const advance = fake.only()
    const { set, where } = setAndWhere(advance.sql)
    expect(set).toContain('"error_code"')
    expect(advance.params).toContain('persisting')
    expect(advance.params).toContain('glm-5.3')
    expect(advance.params).toContain(1_234)
    expect(advance.params).toContain(567)
    expect(advance.params).toContain(13_000)
    expect(where).toContain('"nina_turns"."status"')
    expect(advance.params).toContain('pending')
  })

  it('falls to a metrics-only arm when the claim was closed beneath us', async () => {
    /* Arm 1 advances nothing — a send's cancel won the row while the model call was in flight. */
    fake.enqueue([])

    await chatturn.ninaChatTurnStore(TURN).record(USER, turnRow())

    expect(fake.queries).toHaveLength(2)
    const metricsOnly = fake.last()
    const { set, where } = setAndWhere(metricsOnly.sql)
    /* THE GUARANTEE: the fallback arm physically cannot write the reason columns. */
    expect(set).not.toContain('"status"')
    expect(set).not.toContain('"error_code"')
    expect(metricsOnly.params).not.toContain('persisting')
    expect(where).toContain('"nina_turns"."status"')
    expect(metricsOnly.params).toContain('failed')
    /* The money ledger stays honest: the usage the call spent still lands. */
    expect(metricsOnly.params).toContain(1_234)
    expect(metricsOnly.params).toContain(567)
    expect(metricsOnly.params).toContain(13_000)
  })
})

describe('chatTurnWasSuperseded — the ownership read', () => {
  it('is true for exactly failed + superseded', async () => {
    fake.enqueue([projectedRow('failed', 'superseded')])
    await expect(chatturn.chatTurnWasSuperseded(USER, TURN)).resolves.toBe(true)
  })

  it('is false for every other closed state — a slow turn keeps its answer', async () => {
    fake.enqueue([projectedRow('failed', 'stale')])
    await expect(chatturn.chatTurnWasSuperseded(USER, TURN)).resolves.toBe(false)

    fake.enqueue([projectedRow('ok', null)])
    await expect(chatturn.chatTurnWasSuperseded(USER, TURN)).resolves.toBe(false)
  })

  it('is false when the row is gone', async () => {
    fake.enqueue([])
    await expect(chatturn.chatTurnWasSuperseded(USER, TURN)).resolves.toBe(false)
  })
})
