import { describe, expect, it, vi } from 'vitest'

import {
  claimJob,
  closeFailed,
  dispatchCutoffFor,
  findSchemaDrift,
  finishSelfie,
  generate,
  parseArgv,
  resolveWorkerSessionId,
} from '../scripts/nina-image-worker.ts'
import type { ClaimedJob, SchemaColumn } from '../scripts/nina-image-worker.ts'
import { NINA_IMAGE_COST_MICRO_USD, NINA_IMAGE_DISPATCH_GRACE_MS } from '../lib/nina/imagerecipe.ts'

/**
 * The worker's two pure decisions: how it reads its argv, and how it turns an OpenRouter response
 * into an outcome. **No network, no database, no key.**
 *
 * Why this file can exist at all: the worker's `main()` is guarded by an
 * `import.meta.url === process.argv[1]` check, so importing it runs nothing — no `neon()` call, no
 * connection. That guard is the only reason the worker is testable, and it must not be removed.
 */

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')

/**
 * `vi.fn<typeof fetch>` rather than a bare `vi.fn`: the implementation takes no arguments, so an
 * untyped mock types its own `mock.calls` as `[]` and reading `calls[0][1]` to inspect the request
 * body becomes a type error instead of the assertion it looks like. Naming the parameters would fix
 * that too, at the price of two unused-variable warnings.
 */
function stubFetch(response: Response | Error) {
  const fn = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** One statement the worker sent, with `$n` markers where its values went. */
interface Recorded {
  text: string
  values: readonly unknown[]
}

interface FakeSql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  transaction: (queries: unknown[]) => Promise<unknown[]>
  calls: Recorded[]
}

/**
 * A tagged-template client that records instead of connecting.
 *
 * The worker takes its `sql` as a parameter on every function that writes — deliberately, so this is
 * possible — and asserting on the statement it BUILT is the only way to prove Finding 1 without a
 * Postgres. The assertions below therefore look for tokens (`session_id`, `cost_micro_usd`) and
 * check parameter VALUES, never whitespace or clause order, so a reworded statement does not fail a
 * test that is about a column.
 *
 * `rows` scripts the response per statement; `failOn` makes a matching statement throw, which is how
 * "the apology INSERT dies and the job is still closed" is driven.
 */
function fakeSql(options: { rows?: (call: Recorded) => unknown[]; failOn?: RegExp } = {}): FakeSql {
  const calls: Recorded[] = []
  const run = async (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const text = strings.raw
      .map((chunk, index) => (index === 0 ? chunk : `$${index}${chunk}`))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    const call: Recorded = { text, values }
    calls.push(call)
    if (options.failOn?.test(text)) throw new Error('simulated NeonDbError')
    return options.rows?.(call) ?? []
  }
  const sql = run as unknown as FakeSql
  sql.transaction = async (queries: unknown[]) =>
    Promise.all(queries as ReadonlyArray<Promise<unknown>>)
  sql.calls = calls
  return sql
}

/** Every statement the worker sent whose text matches. */
function sent(sql: FakeSql, pattern: RegExp): Recorded[] {
  return sql.calls.filter((call) => pattern.test(call.text))
}

const SESSION_ID = 'sess00000001'

function jobFixture(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    jobId: 'job000000001',
    userId: 'user00000001',
    attempts: 1,
    args: {
      purpose: 'selfie',
      scene: 'a photograph of her at the track',
      mood: null,
      prompt: 'a photograph',
      seed: 42,
      replyToId: 'msg000000001',
      source: 'chat',
      attempts: 1,
      sidecar: 'prompt / model / seed',
    },
    ...overrides,
  }
}

/** A `sql` that answers `resolveWorkerSessionId` with `SESSION_ID` and everything else with []. */
function sqlResolving(sessionId: string | null, options: { failOn?: RegExp } = {}): FakeSql {
  return fakeSql({
    failOn: options.failOn,
    rows: (call) =>
      /with reply as/.test(call.text) && sessionId != null ? [{ id: sessionId }] : [],
  })
}

describe('parseArgv', () => {
  it('reads --job', () => {
    expect(parseArgv(['--job', 'abcdefghijkl'])).toEqual({ jobId: 'abcdefghijkl', dryRun: false })
  })

  it('treats an EMPTY --job as a sweep, which is what a scheduled run sends', () => {
    // `${{ inputs.job_id }}` interpolates to '' on a `schedule` event. This is the line that makes
    // one `run:` expression serve both triggers.
    expect(parseArgv(['--job', '']).jobId).toBeNull()
    expect(parseArgv([]).jobId).toBeNull()
  })

  it('refuses a job id that is not an id', () => {
    expect(parseArgv(['--job', "'; drop table nina_turns; --"]).jobId).toBeNull()
    expect(parseArgv(['--job', 'x'.repeat(200)]).jobId).toBeNull()
  })

  it('reads --dry-run', () => {
    expect(parseArgv(['--dry-run']).dryRun).toBe(true)
  })
})

describe('generate', () => {
  it('returns the image and the reported cost', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }], usage: { cost: 0.04 } }), {
        status: 200,
      }),
    )
    const outcome = await generate('a photograph', 42)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.b64).toBe(PNG_B64)
      expect(outcome.costMicroUsd).toBe(40_000)
    }
  })

  it('sends exactly the recipe body, and no reference image', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fn = stubFetch(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }),
    )
    await generate('a photograph', 42)
    const init = fn.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.resolution).toBe('1K')
    expect(body.aspect_ratio).toBe('3:4')
    expect(body.input_references).toBeUndefined()
  })

  it('a forced TIMEOUT never throws and reports timeout', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const err = new Error('aborted')
    err.name = 'TimeoutError'
    stubFetch(err)
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'timeout' })
  })

  it('a forced POLICY refusal reports policy', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('{"error":{"message":"blocked by safety policy"}}', { status: 400 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'policy' })
  })

  it('a forced HTTP error reports transport', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('bad gateway', { status: 502 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'transport' })
  })

  it('a 200 with no image is not a success', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('{"data":[]}', { status: 200 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'transport' })
  })

  it('falls back to the cost constant when the provider omits usage', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }))
    const outcome = await generate('p', 1)
    if (outcome.ok) expect(outcome.costMicroUsd).toBe(40_000)
  })
})

describe('resolveWorkerSessionId — Finding 1', () => {
  it('asks for the replying message first and the most recent session second, in one statement', async () => {
    const sql = sqlResolving(SESSION_ID)
    expect(await resolveWorkerSessionId(sql, 'user00000001', 'msg000000001')).toBe(SESSION_ID)

    const [call] = sql.calls
    expect(call).toBeDefined()
    // Both branches of `resolveNinaSessionForMessage`'s policy, and the `not exists` guard that
    // makes exactly one of them produce a row.
    expect(call?.text).toMatch(/with reply as/)
    expect(call?.text).toMatch(/from nina_chat_sessions/)
    expect(call?.text).toMatch(/where not exists/)
    // The activity key is his own messages, not hers, and the fallback is the session's own
    // creation — `sessionActivityAt` in lib/nina/sessions.ts.
    expect(call?.text).toMatch(/role = 'runner'/)
    expect(call?.text).toMatch(/coalesce\(a\.last_user_at, s\.created_at\) desc/)
  })

  it('is owner-scoped in both branches (invariant 5)', async () => {
    const sql = sqlResolving(SESSION_ID)
    await resolveWorkerSessionId(sql, 'user00000001', 'msg000000001')
    const [call] = sql.calls
    // Three separate `user_id = $n` bindings: the reply lookup, the activity subquery and the
    // session list. A foreign id must come back empty rather than reach another conversation.
    expect(call?.values.filter((value) => value === 'user00000001')).toHaveLength(3)
  })

  it('returns null when he has no sessions at all, rather than inventing one', async () => {
    // The R11 state: he removed every session he had. The app's policy CREATES here
    // (`ensureNinaSession`); the worker deliberately does not.
    const sql = sqlResolving(null)
    expect(await resolveWorkerSessionId(sql, 'user00000001', null)).toBeNull()
  })
})

describe('finishSelfie — Finding 1', () => {
  const image = { blobUrl: 'https://blob/x.png', pathname: 'nina/u/selfie-x.png', bytes: 1234 }
  const result = { costMicroUsd: 40_000, latencyMs: 78_200 }

  it('writes session_id, and writes the session it resolved', async () => {
    // THE REGRESSION. `nina_messages.session_id` is NOT NULL since migration 0004 and this INSERT
    // omitted it, so every generation ever made was thrown away by the write that would have shown
    // it. Run 33986082744 measured the crash.
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture(), image, result)

    const [insert] = sent(sql, /insert into nina_messages/)
    expect(insert).toBeDefined()
    expect(insert?.text).toMatch(/\bsession_id\b/)
    expect(insert?.values).toContain(SESSION_ID)
  })

  it('still writes the image row and marks the job ok', async () => {
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture(), image, result)
    expect(sent(sql, /insert into nina_message_images/)).toHaveLength(1)
    expect(sent(sql, /set status = 'ok'/)).toHaveLength(1)
  })

  it('ACCUMULATES the spend on success rather than overwriting the failed attempt’s', async () => {
    // INVARIANT 9, on the path that is easiest to get wrong. A job that fails its first attempt
    // (billed, recorded by `closeFailed`'s retry branch) and succeeds on its second must read
    // $0.08, not $0.04. A plain `SET` here would silently discard one whole generation from the
    // ledger — two OpenRouter calls, one number. The column is a per-JOB total on every path.
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture({ attempts: 2 }), image, result)

    const [close] = sent(sql, /set status = 'ok'/)
    expect(close?.text).toMatch(/cost_micro_usd = coalesce\(cost_micro_usd, 0\)/)
    expect(close?.values).toContain(40_000)
  })

  it('refuses to write anything when no session resolves', async () => {
    // Declining beats crashing the process, and beats inventing a conversation he has never seen.
    const sql = sqlResolving(null)
    await expect(finishSelfie(sql, jobFixture(), image, result)).rejects.toThrow(/no session/)
    expect(sent(sql, /insert into/)).toHaveLength(0)
    expect(sent(sql, /update nina_turns/)).toHaveLength(0)
  })
})

describe('closeFailed — Finding 1 and its blast radius', () => {
  const terminal = jobFixture({ attempts: 2, args: { ...jobFixture().args, attempts: 2 } })

  it('the apology carries session_id', async () => {
    const sql = sqlResolving(SESSION_ID)
    await closeFailed(sql, terminal, {
      kind: 'transport',
      latencyMs: 55_600,
      detail: 'x',
      costMicroUsd: null,
    })
    const [insert] = sent(sql, /insert into nina_messages/)
    expect(insert?.text).toMatch(/\bsession_id\b/)
    expect(insert?.values).toContain(SESSION_ID)
  })

  it('MARKS THE JOB FAILED WITH A COST EVEN WHEN THE APOLOGY INSERT THROWS', async () => {
    // THE MONEY TEST. Jobs pF5c6V8YbxAR (73 925 ms) and ChfwHZ2GJT4I (55 600 ms) both reached
    // OpenRouter, both were billed, and both recorded cost_micro_usd NULL — because this INSERT
    // threw and took the process down before the UPDATE below could run. Invariant 9.
    const sql = sqlResolving(SESSION_ID, { failOn: /insert into nina_messages/ })
    const outcome = await closeFailed(sql, terminal, {
      kind: 'transport',
      latencyMs: 73_925,
      detail: 'x',
      costMicroUsd: 40_000,
    })

    expect(outcome).toBe('gave-up')
    const [close] = sent(sql, /set status = 'failed'/)
    expect(close).toBeDefined()
    expect(close?.text).toMatch(/cost_micro_usd = coalesce\(cost_micro_usd, 0\)/)
    expect(close?.values).toContain(40_000)
  })

  it('closes the job when there is no session for the apology either', async () => {
    const sql = sqlResolving(null)
    expect(
      await closeFailed(sql, terminal, {
        kind: 'transport',
        latencyMs: 1,
        detail: 'x',
        costMicroUsd: null,
      }),
    ).toBe('gave-up')
    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
    // Nothing known was spent, so the terminal branch guesses high rather than recording zero.
    expect(sent(sql, /set status = 'failed'/)[0]?.values).toContain(NINA_IMAGE_COST_MICRO_USD)
  })

  it('an avatar job apologises to nobody but is still closed', async () => {
    const sql = sqlResolving(SESSION_ID)
    const avatar = jobFixture({
      attempts: 2,
      args: { ...jobFixture().args, purpose: 'avatar', attempts: 2, replyToId: null },
    })
    await closeFailed(sql, avatar, {
      kind: 'policy',
      latencyMs: 1,
      detail: 'x',
      costMicroUsd: null,
    })
    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
    expect(sent(sql, /set status = 'failed'/)).toHaveLength(1)
  })

  it('a retry records what this attempt is KNOWN to have spent, and never guesses', async () => {
    // A finish failure on attempt 1: the picture was generated and billed, and the old retry branch
    // wrote latency and nothing else, so one generation vanished from the ledger.
    const sql = sqlResolving(SESSION_ID)
    expect(
      await closeFailed(sql, jobFixture({ attempts: 1 }), {
        kind: 'transport',
        latencyMs: 78_200,
        detail: 'finish: x',
        costMicroUsd: 40_000,
      }),
    ).toBe('retry')

    const [retry] = sent(sql, /error_code = 'queued'/)
    expect(retry?.text).toMatch(/cost_micro_usd = coalesce\(cost_micro_usd, 0\)/)
    expect(retry?.values).toContain(40_000)
    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
  })

  it('a retry after a call that returned no figure adds nothing rather than guessing twice', async () => {
    const sql = sqlResolving(SESSION_ID)
    await closeFailed(sql, jobFixture({ attempts: 1 }), {
      kind: 'timeout',
      latencyMs: 240_000,
      detail: 'x',
      costMicroUsd: null,
    })
    expect(sent(sql, /error_code = 'queued'/)[0]?.values).toContain(0)
  })
})

describe('dispatchCutoffFor — Finding 2', () => {
  const now = new Date('2026-09-06T03:03:00.400Z')

  it('a SWEEP leaves a dispatched row alone until the grace has passed', () => {
    const cutoff = dispatchCutoffFor(null, now)
    expect(cutoff.getTime()).toBe(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
    // Job ke20AUHNE0TB, created 03:02:31.897Z — 28.5 s old. A sweep must not steal it: a runner is
    // very probably booting for it right now.
    expect(new Date('2026-09-06T03:02:31.897Z').getTime()).toBeGreaterThan(cutoff.getTime())
  })

  it('a job named by --job is claimable however young it is', () => {
    // THE REGRESSION. Five workflow_dispatch runs on 2026-09-06 all logged
    // `finished { attempted: 0 }` because this comparison went the other way. A GitHub runner needs
    // ~25-40 s to reach the Generate step and fireNinaImageDispatch stamps `dispatched` BEFORE the
    // POST, so no targeted dispatch could EVER claim its own job.
    const cutoff = dispatchCutoffFor('ke20AUHNE0TB', now)
    expect(new Date('2026-09-06T03:02:31.897Z').getTime()).toBeLessThan(cutoff.getTime())
    // A job created in the same instant the runner reads the clock is claimable too.
    expect(now.getTime()).toBeLessThan(cutoff.getTime())
  })

  it('absorbs clock skew between the Vercel writer and the GitHub runner', () => {
    // created_at is stamped by Vercel; `now` is read on the runner. A minute of skew in the
    // hostile direction must not reintroduce the bug, which is why the named window runs FORWARD
    // by the same constant rather than stopping at `now`.
    const cutoff = dispatchCutoffFor('ke20AUHNE0TB', now)
    const skewed = new Date(now.getTime() + NINA_IMAGE_DISPATCH_GRACE_MS - 1_000)
    expect(skewed.getTime()).toBeLessThan(cutoff.getTime())
  })
})

describe('claimJob — Finding 2, as the statement actually sent', () => {
  const now = new Date('2026-09-06T03:03:00.400Z')

  it('sends a FUTURE dispatch cutoff for a named job and a PAST one for a sweep', async () => {
    const named = fakeSql()
    await claimJob(named, 'ke20AUHNE0TB', now)
    const sweep = fakeSql()
    await claimJob(sweep, null, now)

    const cutoffOf = (sql: FakeSql) =>
      Date.parse(
        (sql.calls[0]?.values.find(
          (value) => typeof value === 'string' && value.endsWith('Z') && value.includes('T'),
        ) ?? '') as string,
      )

    expect(cutoffOf(named)).toBeGreaterThan(now.getTime())
    expect(cutoffOf(sweep)).toBeLessThan(now.getTime())
  })

  it('keeps the attempts bound, which is the only thing stopping an infinite reclaim loop', async () => {
    const sql = fakeSql()
    await claimJob(sql, 'ke20AUHNE0TB', now)
    expect(sql.calls[0]?.text).toMatch(/attempts'\)::int, 0\) < \$/)
  })

  it('does not relax the running reclaim for a named job, so a live generation is never claimed twice', async () => {
    const sql = fakeSql()
    await claimJob(sql, 'ke20AUHNE0TB', now)
    expect(sql.calls[0]?.text).toMatch(/error_code = 'running' and created_at < \$/)
  })
})

describe('findSchemaDrift — Finding 1 as a CLASS', () => {
  function column(
    overrides: Partial<SchemaColumn> & Pick<SchemaColumn, 'table_name' | 'column_name'>,
  ): SchemaColumn {
    return {
      is_nullable: 'YES',
      column_default: null,
      is_identity: 'NO',
      is_generated: 'NEVER',
      ...overrides,
    }
  }

  const spec = {
    widget: { inserts: true, columns: ['id', 'user_id'] },
    ledger: { inserts: false, columns: ['id'] },
  }

  it('is silent when the schema and the worker agree', () => {
    expect(
      findSchemaDrift(
        [
          column({ table_name: 'widget', column_name: 'id', is_nullable: 'NO' }),
          column({ table_name: 'widget', column_name: 'user_id', is_nullable: 'NO' }),
          column({ table_name: 'ledger', column_name: 'id', is_nullable: 'NO' }),
        ],
        spec,
      ),
    ).toEqual([])
  })

  it('reports a column the worker names and the database does not have (a rename)', () => {
    expect(
      findSchemaDrift(
        [
          column({ table_name: 'widget', column_name: 'id' }),
          column({ table_name: 'ledger', column_name: 'id' }),
        ],
        spec,
      ),
    ).toContain('widget.user_id is missing')
  })

  it('REPORTS A NOT NULL COLUMN WITH NO DEFAULT THAT THE WORKER NEVER WRITES', () => {
    // FINDING 1'S EXACT SHAPE. Migration 0004 added nina_messages.session_id NOT NULL after this
    // worker was written; the existence-only check saw a column it did not name and said nothing,
    // and every generation crashed on the INSERT. This is the assertion that would have caught it.
    const drift = findSchemaDrift(
      [
        column({ table_name: 'widget', column_name: 'id', is_nullable: 'NO' }),
        column({ table_name: 'widget', column_name: 'user_id', is_nullable: 'NO' }),
        column({ table_name: 'widget', column_name: 'session_id', is_nullable: 'NO' }),
        column({ table_name: 'ledger', column_name: 'id', is_nullable: 'NO' }),
      ],
      spec,
    )
    expect(drift).toHaveLength(1)
    expect(drift[0]).toMatch(/widget\.session_id is NOT NULL/)
  })

  it('does not report a NOT NULL column the database fills for us', () => {
    // `seq` is a bigserial, `sent_at`/`source`/`sort_order` have DEFAULTs. Demanding that the worker
    // write the conversation's sequence would be a check that is wrong rather than strict.
    expect(
      findSchemaDrift(
        [
          column({ table_name: 'widget', column_name: 'id', is_nullable: 'NO' }),
          column({ table_name: 'widget', column_name: 'user_id', is_nullable: 'NO' }),
          column({
            table_name: 'widget',
            column_name: 'seq',
            is_nullable: 'NO',
            column_default: "nextval('widget_seq_seq'::regclass)",
          }),
          column({ table_name: 'widget', column_name: 'n', is_nullable: 'NO', is_identity: 'YES' }),
          column({
            table_name: 'widget',
            column_name: 'g',
            is_nullable: 'NO',
            is_generated: 'ALWAYS',
          }),
          column({ table_name: 'ledger', column_name: 'id', is_nullable: 'NO' }),
        ],
        spec,
      ),
    ).toEqual([])
  })

  it('exempts a table the worker only reads or only UPDATEs', () => {
    // nina_turns is claimed and closed, never inserted. A statement that never supplies a column
    // cannot omit one, so demanding coverage there would be noise that trains people to widen the
    // list without thinking.
    expect(
      findSchemaDrift(
        [
          column({ table_name: 'widget', column_name: 'id', is_nullable: 'NO' }),
          column({ table_name: 'widget', column_name: 'user_id', is_nullable: 'NO' }),
          column({ table_name: 'ledger', column_name: 'id', is_nullable: 'NO' }),
          column({ table_name: 'ledger', column_name: 'kind', is_nullable: 'NO' }),
        ],
        spec,
      ),
    ).toEqual([])
  })

  it('reports a whole missing table', () => {
    expect(findSchemaDrift([column({ table_name: 'ledger', column_name: 'id' })], spec)).toContain(
      'widget (whole table) is missing',
    )
  })
})
