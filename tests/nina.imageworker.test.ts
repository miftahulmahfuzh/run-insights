import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateVAPIDKeys } from 'web-push'

import {
  claimJob,
  closeFailed,
  dispatchCutoffFor,
  findContentDuplicate,
  findSchemaDrift,
  finishSelfie,
  generate,
  parseArgv,
  releaseBlobIfUnreferenced,
  REQUIRED_COLUMNS,
  resolveWorkerSessionId,
} from '../scripts/nina-image-worker.ts'
import type { ClaimedJob, SchemaColumn } from '../scripts/nina-image-worker.ts'
/* Imported by its own path, not through the barrel: the barrel's published surface is the old
 * single file's surface (its header states the rule, which is also why `finishAvatar` is absent
 * from it), and `push.ts` did not exist then. */
import { sendWorkerPush } from '../scripts/nina-image-worker/push.ts'
import type {
  SendWorkerNotification,
  WorkerNotifier,
  WorkerPushReport,
} from '../scripts/nina-image-worker/push.ts'
import {
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  /* New: the `closeFailed` apology cases need a job AT the attempt ceiling, so that it gives up
   * rather than queueing a retry. The real constant, not a literal — a bump to it must move the
   * fixture, not silently turn six cases into retry cases that assert nothing. */
  NINA_IMAGE_MAX_ATTEMPTS,
  OPENROUTER_IMAGE_URL,
} from '../lib/nina/imagerecipe.ts'

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

/** NIST FIPS 180-4's SHA-256("abc") — the spelling the hash util produces and the column expects. */
const CONTENT_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

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

  it('sends exactly the recipe body, and no reference image when the job has none', async () => {
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

  it('R10: the second host sends the same anchored payload as the first', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fn = vi.fn<typeof fetch>(async (input) => {
      if (String(input).startsWith(OPENROUTER_IMAGE_URL)) {
        return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 })
      }
      return new Response(Buffer.alloc(4, 1), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '4' },
      })
    })
    vi.stubGlobal('fetch', fn)

    const outcome = await generate('a photograph', 42, 'https://blob.test/nina/a.png')

    expect(outcome.ok).toBe(true)
    const init = fn.mock.calls[1]?.[1]
    const body = JSON.parse(String(init?.body)) as {
      input_references?: Array<{ image_url: { url: string } }>
    }
    expect(body.input_references?.length).toBe(1)
    expect(body.input_references?.[0]?.image_url.url.startsWith('data:image/png;base64,')).toBe(
      true,
    )
  })

  it('R10: a broken reference degrades to unanchored here too, not to a failed job', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fn = vi.fn<typeof fetch>(async (input) => {
      if (String(input).startsWith(OPENROUTER_IMAGE_URL)) {
        return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 })
      }
      return new Response('nope', { status: 403 })
    })
    vi.stubGlobal('fetch', fn)

    const outcome = await generate('a photograph', 42, 'https://blob.test/nina/a.png')

    expect(outcome.ok).toBe(true)
    const init = fn.mock.calls[1]?.[1]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
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
  const image = {
    blobUrl: 'https://blob/x.png',
    pathname: 'nina/u/selfie-x.png',
    bytes: 1234,
    contentHash: null as string | null,
    duplicateOf: null,
  }
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

  it('names content_hash in the image INSERT and binds NULL while nothing hashes yet', async () => {
    // media-dedupe P1: the column pass-through, mirror of insertNinaMessageImages. The NULL is
    // the whole point for now — P3 replaces it with a store-time hash, and this assertion is
    // what makes the column impossible to forget in between.
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture(), image, result)

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.text).toMatch(/\bcontent_hash\b/)
    expect(insert?.values).toContain(null)
  })

  it('binds the hash the caller supplies, once one exists', async () => {
    // P3's contract, asserted before P3 exists: the parameter is a pass-through, not a constant.
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture(), { ...image, contentHash: CONTENT_HASH }, result)

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.values).toContain(CONTENT_HASH)
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

  it('media-dedupe P3: the INSERT names source_image_id and binds the plan row, not the raw image', async () => {
    // The skip path: `store` found the keeper and returned ITS object. The row must name the
    // keeper, and the statement must carry the column so the reference is impossible to forget.
    const keeper = {
      id: 'keeper000001',
      blobUrl: 'https://blob/keeper.png',
      pathname: 'nina/u/selfie-keeper.png',
    }
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(
      sql,
      jobFixture(),
      {
        blobUrl: keeper.blobUrl,
        pathname: keeper.pathname,
        bytes: 1234,
        contentHash: CONTENT_HASH,
        duplicateOf: keeper,
      },
      result,
    )

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.text).toMatch(/\bsource_image_id\b/)
    expect(insert?.values).toContain(keeper.id)
    expect(insert?.values).toContain(keeper.blobUrl)
    /* The hash rides the reference row too — invariant 4 is about the BYTES, which are the same. */
    expect(insert?.values).toContain(CONTENT_HASH)
    /* Nothing was put, so nothing is released: no release SELECT (keyed on `thumb_pathname` —
     * the only statement in the whole file that names it) and no `del`. */
    expect(sent(sql, /thumb_pathname/)).toHaveLength(0)
  })

  it('media-dedupe P3: a race at insert time writes the reference and then releases the loser', async () => {
    // The re-check SELECT answers with a keeper (the rows callback matches it by its shape), so
    // the fresh bytes must be referenced AND then checked before a `del`.
    const keeper = {
      id: 'keeper000001',
      blobUrl: 'https://blob/keeper.png',
      pathname: 'nina/u/selfie-keeper.png',
    }
    const sql = fakeSql({
      rows: (call) => {
        /* Order matters: `resolveWorkerSessionId`'s statement also contains `union all`, so the
         * reply lookup must be answered first. */
        if (/with reply as/.test(call.text)) return [{ id: SESSION_ID }]
        /* The dedup re-check is the only other statement naming content_hash in a WHERE. The row
         * is spelled as the DATABASE spells it — snake_case — because `findContentDuplicate`
         * maps `blob_url` onto the camelCase hit (the shape its own mapping test pins). */
        if (/content_hash =/.test(call.text)) {
          return [{ id: keeper.id, blob_url: keeper.blobUrl, pathname: keeper.pathname }]
        }
        /* The release check asks both tables' six columns; nothing else references the loser. */
        return []
      },
    })
    await finishSelfie(
      sql,
      jobFixture(),
      {
        blobUrl: 'https://blob/fresh.png',
        pathname: 'nina/u/selfie-fresh.png',
        bytes: 1234,
        contentHash: CONTENT_HASH,
        duplicateOf: null,
      },
      result,
    )

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.values).toContain(keeper.id)
    expect(insert?.values).toContain(keeper.blobUrl)
    /* The release ran, and it asked BOTH tables' six columns before deleting — the worker cannot
     * release an object the app would have kept. Keyed on `thumb_pathname`: the only statement in
     * the file that names it. */
    const [release] = sent(sql, /thumb_pathname/)
    expect(release?.text).toMatch(/thumb_url/)
    expect(release?.text).toMatch(/user_id = \$\d+/)
  })

  it('media-dedupe P3: a dedup re-check fault degrades to an original, and the job still closes', async () => {
    const sql = fakeSql({
      failOn: /content_hash =/, // the re-check SELECT is the only statement that matches
      rows: (call) => (/with reply as/.test(call.text) ? [{ id: SESSION_ID }] : []),
    })
    await expect(
      finishSelfie(
        sql,
        jobFixture(),
        {
          blobUrl: 'https://blob/fresh.png',
          pathname: 'nina/u/selfie-fresh.png',
          bytes: 1234,
          contentHash: CONTENT_HASH,
          duplicateOf: null,
        },
        result,
      ),
    ).resolves.toBeUndefined()

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.values).toContain('https://blob/fresh.png')
    expect(insert?.values).toContain(null) // source_image_id
    expect(sent(sql, /set status = 'ok'/)).toHaveLength(1)
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

describe('findContentDuplicate — media-dedupe P3', () => {
  it('asks the owner-scoped, originals-only, newest-first question in one statement', async () => {
    const sql = sqlResolving(SESSION_ID)
    await findContentDuplicate(sql, 'user00000001', CONTENT_HASH)

    const [call] = sql.calls
    expect(call?.text).toMatch(/from nina_message_images/)
    expect(call?.text).toMatch(/user_id = \$\d+/)
    expect(call?.text).toMatch(/content_hash = \$\d+/)
    /* ORIGINALS ONLY: a reference must never satisfy a dedup lookup, or two references could
     * chain and the keeper's deletion would re-materialize both as originals. */
    expect(call?.text).toMatch(/source_avatar_id is null/)
    expect(call?.text).toMatch(/source_image_id is null/)
    /* Newest first, the collection reads' own tie-break. */
    expect(call?.text).toMatch(/order by created_at desc, id desc/)
    expect(call?.text).toMatch(/limit 1/)
  })

  it('answers null on a miss', async () => {
    const sql = sqlResolving(SESSION_ID)
    expect(await findContentDuplicate(sql, 'user00000001', CONTENT_HASH)).toBeNull()
  })

  it('maps the snake_case row onto the dedup shape', async () => {
    const sql = fakeSql({
      rows: (call) =>
        /content_hash =/.test(call.text)
          ? [
              {
                id: 'keeper000001',
                blob_url: 'https://blob/k.png',
                pathname: 'nina/u/selfie-k.png',
              },
            ]
          : [],
    })
    expect(await findContentDuplicate(sql, 'user00000001', CONTENT_HASH)).toEqual({
      id: 'keeper000001',
      blobUrl: 'https://blob/k.png',
      pathname: 'nina/u/selfie-k.png',
    })
  })
})

describe('releaseBlobIfUnreferenced — media-dedupe P3', () => {
  const ref = { blobUrl: 'https://blob/loser.png', pathname: 'nina/u/selfie-loser.png' }

  it('deletes only when no row in either table answers', async () => {
    const sql = sqlResolving(SESSION_ID)
    sql.calls.length = 0
    const delFn = vi.fn(async () => undefined)
    expect(await releaseBlobIfUnreferenced(sql, 'user00000001', ref, delFn)).toBe('deleted')
    expect(delFn).toHaveBeenCalledWith(ref.blobUrl)
  })

  it('keeps the object when another row still points at it, and never calls del', async () => {
    const sql = fakeSql({
      rows: (call) => (/union all/.test(call.text) ? [{ id: 'other0000001' }] : []),
    })
    const delFn = vi.fn(async () => undefined)
    expect(await releaseBlobIfUnreferenced(sql, 'user00000001', ref, delFn)).toBe('shared')
    expect(delFn).not.toHaveBeenCalled()
  })

  it('errs toward keep on any fault — an orphan is recoverable, a dead reference is not', async () => {
    const sql = fakeSql({ failOn: /union all/ })
    const delFn = vi.fn(async () => undefined)
    expect(await releaseBlobIfUnreferenced(sql, 'user00000001', ref, delFn)).toBe('failed')
    expect(delFn).not.toHaveBeenCalled()
  })
})

describe('REQUIRED_COLUMNS — media-dedupe P3 names what it queries', () => {
  it('lists the dedup columns on both tables the worker now reads', () => {
    // The file's own rule: every column a statement names must be listed, or a rename survives
    // silently. `findContentDuplicate` and `releaseBlobIfUnreferenced` each named new ones.
    const images = REQUIRED_COLUMNS.nina_message_images
    for (const column of ['content_hash', 'source_avatar_id', 'source_image_id', 'created_at']) {
      expect(images?.columns, column).toContain(column)
    }
    const avatars = REQUIRED_COLUMNS.nina_avatars
    for (const column of ['thumb_pathname', 'thumb_url']) {
      expect(avatars?.columns, column).toContain(column)
    }
  })
})

/**
 * **The off-platform half of nina-push-every-message R1.**
 *
 * No network, no key, no database — the same three noes the rest of this file holds to. The send
 * itself arrives through `createRequire`, which no `vi.mock` registry reaches, so it is injected;
 * everything else is real, including `configureVapid`, which is driven with a genuine key pair
 * generated offline so that the "configured" path is exercised rather than stubbed past.
 */
describe('sendWorkerPush — the app’s sender, restated for a host that cannot import it', () => {
  /* A real P-256 pair, generated offline by web-push itself. `setVapidDetails` validates the point,
   * so a made-up string would throw and every test below would take the "not configured" branch
   * while appearing to test the others. */
  const VAPID = generateVAPIDKeys()
  const USER = 'user00000001'
  const BUBBLE = [{ id: 'msg000000002', body: 'ini fotonya' }]
  const SUB = {
    id: 'sub000000001',
    endpoint: 'https://web.push.apple.com/abcdef',
    p256dh: 'p256dh-key',
    auth: 'auth-secret',
    failure_count: 0,
  }

  /** A `sql` that answers the subscription SELECT with `rows` and everything else with []. */
  function sqlWithSubscriptions(rows: unknown[], options: { failOn?: RegExp } = {}): FakeSql {
    return fakeSql({
      failOn: options.failOn,
      rows: (call) => (/from push_subscriptions/.test(call.text) ? rows : []),
    })
  }

  function withVapid(): void {
    vi.stubEnv('VAPID_SUBJECT', 'mailto:nina@example.com')
    vi.stubEnv('VAPID_PUBLIC_KEY', VAPID.publicKey)
    vi.stubEnv('VAPID_PRIVATE_KEY', VAPID.privateKey)
  }

  /** A send that resolves. Typed, so `mock.calls[0]` is a tuple and not `[]`. */
  function stubSend(outcome?: Error) {
    return vi.fn<SendWorkerNotification>(async () => {
      if (outcome != null) throw outcome
      return { statusCode: 201 }
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllEnvs()
  })

  it('skips with a reason, and touches nothing at all, when this host has no VAPID keys', async () => {
    /* THE BRANCH EVERY RUN TAKES UNTIL THE THREE REPOSITORY SECRETS EXIST. Stubbed to '' rather
     * than left unset, so a developer who happens to export VAPID_* in their shell gets the same
     * verdict as CI. Plan invariant 4: a host with no keys is "no notifications", never an error. */
    vi.stubEnv('VAPID_SUBJECT', '')
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const sql = sqlWithSubscriptions([SUB])
    const send = stubSend()

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    expect(report.skipped).toMatch(/VAPID/)
    expect(report.attempted).toBe(0)
    expect(send).not.toHaveBeenCalled()
    /* Not even the SELECT: the cheapest branch is the one every run takes. */
    expect(sql.calls).toHaveLength(0)
  })

  it('skips before reading anything when no bubble has a body', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])
    const send = stubSend()

    const report = await sendWorkerPush(
      sql,
      USER,
      [{ id: 'm1', body: '   ' }],
      'worker_photo_delivered',
      send,
    )

    expect(report.skipped).toBe('no message body to send')
    expect(send).not.toHaveBeenCalled()
    expect(sql.calls).toHaveLength(0)
  })

  it('asks the owner-scoped, not-revoked question `listLivePushSubscriptions` asks', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])

    await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', stubSend())

    const [select] = sent(sql, /from push_subscriptions/)
    expect(select?.text).toMatch(/user_id = \$\d+/)
    expect(select?.text).toMatch(/revoked_at is null/)
    /* Every column this statement names, so a rename is caught here — `push_subscriptions` is
     * deliberately NOT in preflight's REQUIRED_COLUMNS (a drift must not abort a generation), so
     * this assertion is the instrument that replaces it. */
    for (const column of ['id', 'endpoint', 'p256dh', 'auth', 'failure_count']) {
      expect(select?.text, column).toContain(column)
    }
    expect(select?.values).toContain(USER)
  })

  it('"notifications are off" is a normal outcome, not an error', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([])
    const send = stubSend()

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    expect(report.skipped).toBe('no live subscriptions')
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the wire format lib/service-worker.js reads, under the one Nina tag', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])
    const send = stubSend()

    await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    const call = send.mock.calls[0]!
    expect(call[0]).toEqual({
      endpoint: SUB.endpoint,
      keys: { p256dh: SUB.p256dh, auth: SUB.auth },
    })
    /* Built by `buildNinaPushPayload`, not assembled here — the whole point of importing
     * `lib/push/payload.ts` is that the two hosts cannot disagree about the wire. */
    expect(JSON.parse(call[1] as string)).toEqual({
      v: 1,
      title: 'Nina',
      body: 'ini fotonya',
      url: '/nina',
      tag: 'nina',
      messageId: 'msg000000002',
      kind: 'worker_photo_delivered',
    })
    const options = call[2] as Record<string, unknown>
    expect(options.TTL).toBe(3 * 60 * 60)
    expect(options.urgency).toBe('normal')
    expect(options.topic).toBe('nina')
    /* The ceiling the app side does not have: this runs under `timeout-minutes: 6` shared with
     * three 78-second generations. */
    expect(options.timeout).toBeTypeOf('number')
  })

  it('a delivered push clears the failure streak', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([{ ...SUB, failure_count: 3 }])

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', stubSend())

    expect(report).toEqual({
      attempted: 1,
      delivered: 1,
      pruned: 0,
      retryable: 0,
      skipped: null,
    })
    const [update] = sent(sql, /update push_subscriptions/)
    expect(update?.text).toMatch(/failure_count = 0/)
    expect(update?.text).toMatch(/last_success_at = now\(\)/)
    expect(update?.values).toContain(SUB.id)
    expect(update?.values).toContain(USER)
  })

  it('a 410 Gone revokes the subscription in the same statement', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])
    const gone = Object.assign(new Error('Gone'), { statusCode: 410 })

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', stubSend(gone))

    expect(report.pruned).toBe(1)
    expect(report.delivered).toBe(0)
    const [update] = sent(sql, /update push_subscriptions/)
    expect(update?.text).toMatch(/failure_count = failure_count \+ 1/)
    expect(update?.text).toMatch(/revoked_at = case when/)
    expect(update?.values).toContain(true)
  })

  it('a socket fault is retryable and the subscription is kept', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])

    const report = await sendWorkerPush(
      sql,
      USER,
      BUBBLE,
      'worker_photo_delivered',
      stubSend(new Error('ECONNRESET')),
    )

    expect(report.retryable).toBe(1)
    expect(report.pruned).toBe(0)
    const [update] = sent(sql, /update push_subscriptions/)
    expect(update?.values).toContain(false)
  })

  it('the fifth consecutive failure revokes even with no terminal status', async () => {
    /* `shouldRevokeSubscription` is the app's own function, imported — PUSH_FAILURE_LIMIT appears
     * nowhere in the worker. This is the assertion that proves it, because getting the threshold
     * from a second copy would be invisible everywhere else. */
    withVapid()
    const sql = sqlWithSubscriptions([{ ...SUB, failure_count: 4 }])

    const report = await sendWorkerPush(
      sql,
      USER,
      BUBBLE,
      'worker_photo_delivered',
      stubSend(new Error('ETIMEDOUT')),
    )

    expect(report.pruned).toBe(1)
    expect(sent(sql, /update push_subscriptions/)[0]?.values).toContain(true)
  })

  it('one subscription’s failure does not stop the next — a phone and a laptop are two rows', async () => {
    withVapid()
    const second = { ...SUB, id: 'sub000000002', endpoint: 'https://fcm.googleapis.com/xyz' }
    const sql = sqlWithSubscriptions([SUB, second])
    const send = vi.fn<SendWorkerNotification>(async (subscription) => {
      if (subscription.endpoint === SUB.endpoint) throw new Error('ECONNRESET')
      return { statusCode: 201 }
    })

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    expect(report.attempted).toBe(2)
    expect(report.delivered).toBe(1)
    expect(report.retryable).toBe(1)
  })

  it('an unreadable push_subscriptions degrades to a skip and never throws', async () => {
    /* The reason that table is absent from preflight's REQUIRED_COLUMNS: a notification drift must
     * surface as one log line, not as a red workflow that never claims the job it exists to
     * rescue. */
    withVapid()
    const sql = sqlWithSubscriptions([SUB], { failOn: /from push_subscriptions/ })
    const send = stubSend()

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    expect(report.skipped).toMatch(/subscriptions unreadable/)
    expect(send).not.toHaveBeenCalled()
  })

  it('a bookkeeping fault after a delivered push does not turn it into a failure', async () => {
    /* The one place this file deliberately does NOT mirror `sendPushToSubscription`, which keeps
     * `recordPushSuccess` inside the send's `try` and would increment the failure streak of a
     * subscription that just worked. */
    withVapid()
    const sql = fakeSql({
      failOn: /update push_subscriptions/,
      rows: (call) => (/from push_subscriptions/.test(call.text) ? [SUB] : []),
    })

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', stubSend())

    expect(report.delivered).toBe(1)
    expect(report.retryable).toBe(0)
    expect(report.pruned).toBe(0)
  })
})

/**
 * The call site: `finishSelfie` notifies, and nothing it does to the notification can cost the
 * photograph. Separate from the `finishSelfie — Finding 1` block above so that block's nine cases
 * keep passing four arguments, which is also the proof the new parameter's default works.
 */
describe('finishSelfie — the push (nina-push-every-message R1)', () => {
  const image = {
    blobUrl: 'https://blob/x.png',
    pathname: 'nina/u/selfie-x.png',
    bytes: 1234,
    contentHash: null as string | null,
    duplicateOf: null,
  }
  const result = { costMicroUsd: 40_000, latencyMs: 78_200 }
  const NO_PUSH: WorkerPushReport = {
    attempted: 0,
    delivered: 0,
    pruned: 0,
    retryable: 0,
    skipped: 'test',
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('notifies once, with the caption it actually wrote and this host’s own kind', async () => {
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await finishSelfie(sql, jobFixture(), image, result, notify)

    expect(notify).toHaveBeenCalledTimes(1)
    const [, userId, messages, kind] = notify.mock.calls[0]!
    expect(userId).toBe('user00000001')
    /* NOT `lib/nina/imagerun.ts`'s `'photo_delivered'`. The two hosts stamp DIFFERENT kinds for
     * the same event on purpose: this worker only runs when the app's own invocation was killed,
     * so the `worker_` prefix is the one thing in a log line that says the backstop delivered this
     * photograph. Collapsing them would make the diagnostic vacuous. */
    expect(kind).toBe('worker_photo_delivered')
    /* The body is the string the INSERT bound, not a second `ninaImageCaption` call that happens
     * to agree. */
    const [insert] = sent(sql, /insert into nina_messages/)
    expect(insert?.values).toContain(messages[0]?.body)
    expect(messages).toHaveLength(1)
  })

  it('sends only after the message row, the image row and the ok close are all in', async () => {
    /* A notification for a photograph that is not in the chat yet is the worst outcome available
     * here: the tap opens an empty frame. */
    const sql = sqlResolving(SESSION_ID)
    let statementsAtNotify = -1
    const notify = vi.fn<WorkerNotifier>(async () => {
      statementsAtNotify = sql.calls.length
      return NO_PUSH
    })

    await finishSelfie(sql, jobFixture(), image, result, notify)

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(1)
    expect(sent(sql, /insert into nina_message_images/)).toHaveLength(1)
    expect(sent(sql, /set status = 'ok'/)).toHaveLength(1)
    /* Nothing runs after the notify, so every statement the function sends was already sent when
     * it fired. */
    expect(statementsAtNotify).toBe(sql.calls.length)
  })

  it('a notifier that throws leaves the photograph, its image row and the closed job alone', async () => {
    /* Plan invariant 2, and Finding 1's blast radius restated: a throw here would send `runOneJob`
     * into `closeFailed`, which would mark a DELIVERED generation failed and apologise for a
     * picture he can already see. */
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => {
      throw new Error('push service on fire')
    })

    await expect(finishSelfie(sql, jobFixture(), image, result, notify)).resolves.toBeUndefined()

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(1)
    expect(sent(sql, /insert into nina_message_images/)).toHaveLength(1)
    expect(sent(sql, /set status = 'ok'/)).toHaveLength(1)
  })

  it('does not notify when no session resolves, because no message was written', async () => {
    const sql = sqlResolving(null)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await expect(finishSelfie(sql, jobFixture(), image, result, notify)).rejects.toThrow(
      /no session/,
    )

    expect(notify).not.toHaveBeenCalled()
  })
})

/**
 * `closeFailed` — R22's apology on this host, and the last uncovered `nina_messages` write in the
 * plan set (reconciler ruling; see Step 2f). The in-platform twin is
 * `lib/nina/imagejobs.ts`'s `postNinaApologyMessage`, which phase 3 pushes as `'photo_apology'`.
 * This host stamps `'worker_photo_apology'`, deliberately — see `finishSelfie`'s header.
 *
 * The existing `closeFailed` cases above pass three arguments and still do, which is the proof the
 * new parameter's default works.
 */
describe('closeFailed — the apology push (nina-push-every-message R1)', () => {
  const GAVE_UP = { kind: 'timeout' as const, latencyMs: 78_000, detail: 'x', costMicroUsd: null }
  const NO_PUSH: WorkerPushReport = {
    attempted: 0,
    delivered: 0,
    pruned: 0,
    retryable: 0,
    skipped: 'test',
  }

  /** A job at the attempt ceiling, so `closeFailed` gives up rather than queueing a retry. */
  function spentJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
    return { ...jobFixture(), attempts: NINA_IMAGE_MAX_ATTEMPTS, ...overrides } as ClaimedJob
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('pushes the apology it wrote, with the id the row carries and the worker kind', async () => {
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await expect(closeFailed(sql, spentJob(), GAVE_UP, notify)).resolves.toBe('gave-up')

    expect(notify).toHaveBeenCalledTimes(1)
    const [, , messages, kind] = notify.mock.calls[0]!
    /* NOT phase 3's `'photo_apology'`: the two hosts keep separate kinds so a log line can say
     * which one gave the photograph up. */
    expect(kind).toBe('worker_photo_apology')
    /* Both the id and the sentence are the INSERT's own bound values, not a second draw. */
    const [insert] = sent(sql, /insert into nina_messages/)
    expect(insert?.values).toContain(messages[0]?.id)
    expect(insert?.values).toContain(messages[0]?.body)
  })

  it('pushes only after the job is closed failed, never while it is still pending', async () => {
    const sql = sqlResolving(SESSION_ID)
    let statementsAtNotify = -1
    const notify = vi.fn<WorkerNotifier>(async () => {
      statementsAtNotify = sql.calls.length
      return NO_PUSH
    })

    await closeFailed(sql, spentJob(), GAVE_UP, notify)

    expect(sent(sql, /set status = 'failed'/)).toHaveLength(1)
    expect(statementsAtNotify).toBe(sql.calls.length)
  })

  it('a retry says nothing — there is nothing to apologise for yet', async () => {
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await expect(
      closeFailed(sql, { ...jobFixture(), attempts: 1 } as ClaimedJob, GAVE_UP, notify),
    ).resolves.toBe('retry')

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('an AVATAR job says nothing — nobody asked for one in the chat', async () => {
    const sql = sqlResolving(SESSION_ID)
    const job = spentJob()
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await closeFailed(
      sql,
      { ...job, args: { ...job.args, purpose: 'avatar' } } as ClaimedJob,
      GAVE_UP,
      notify,
    )

    expect(notify).not.toHaveBeenCalled()
  })

  it('says nothing when no session resolved, because no apology row was written', async () => {
    const sql = sqlResolving(null)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await expect(closeFailed(sql, spentJob(), GAVE_UP, notify)).resolves.toBe('gave-up')

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
    /* The job is still closed. A missing apology never costs the ledger. */
    expect(sent(sql, /set status = 'failed'/)).toHaveLength(1)
  })

  it('a notifier that throws still closes the job and still returns gave-up', async () => {
    /* Plan invariant 2, and this function's own header: a throw here is what once killed the
     * process before the money was recorded. The notify's `try` is separate from the apology
     * write's, so this failure cannot be logged as "the apology could not be written" either. */
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => {
      throw new Error('push service on fire')
    })

    await expect(closeFailed(sql, spentJob(), GAVE_UP, notify)).resolves.toBe('gave-up')

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(1)
    expect(sent(sql, /set status = 'failed'/)).toHaveLength(1)
  })
})
