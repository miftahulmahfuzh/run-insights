import { neonConfig } from '@neondatabase/serverless'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { newId } from '@/lib/id'
import { ninaImageApology } from '@/lib/nina/imagefail'
import {
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_WIDTH,
  OPENROUTER_IMAGE_URL,
  type NinaImageJobArgs,
} from '@/lib/nina/imagerecipe'

/**
 * **R5, end to end, against a REAL Postgres and a REAL Blob store.**
 *
 *     TEST_DATABASE_URL=<pooled neon branch url> \
 *     BLOB_READ_WRITE_TOKEN=<the real token from .env.local> \
 *     npm run test:int
 *
 * Skipped entirely without BOTH, so a plain `npm test` never touches a database and never uploads
 * a byte. **`.env.local` is deliberately NOT loaded here** — it carries the PRODUCTION
 * `DATABASE_URL`, and `tests/live/loadEnvLocal.ts` loads it with `override: true`. An integration
 * suite that imported that helper would write its throwaway rows into production. The two
 * variables above are passed on the command line, named one at a time, on purpose.
 *
 * ── HOW TO GET A `TEST_DATABASE_URL` WHEN THERE IS NO NEON BRANCH ─────────────────────────────
 * A Neon *branch* is the nicest answer, but it needs `neonctl` or an API key and this repo carries
 * neither. A separate DATABASE on the same endpoint isolates exactly as well and is two commands.
 * Take `DATABASE_URL_UNPOOLED` from `.env.local` — **splitting at the first whitespace**, because
 * that line ends in an inline `# pooled…` comment and a naive extraction hands psql
 * `channel_binding=require   # pooled…`, which dies with "invalid channel_binding value":
 *
 *     psql "$UNPOOLED" -c 'CREATE DATABASE run_insights_itest'
 *     swap() { printf '%s' "$1" | sed -E 's#^(postgresql://[^/?]+)/[^?]+(\?.*)$#\1/run_insights_itest\2#'; }
 *     DATABASE_URL_UNPOOLED="$(swap "$UNPOOLED")" npm run db:migrate
 *     TEST_DATABASE_URL="$(swap "$POOLED")" \
 *       BLOB_READ_WRITE_TOKEN=… npm run test:int
 *     psql "$UNPOOLED" -c "select pg_terminate_backend(pid) from pg_stat_activity
 *                          where datname='run_insights_itest'"
 *     psql "$UNPOOLED" -c 'DROP DATABASE run_insights_itest'
 *
 * The swap is anchored to `postgresql://host/` on purpose. A bare `${POOLED/\/neondb/…}`
 * substring replace matches the `/neondb` inside this project's `neondb_owner` USERNAME first
 * and corrupts the URL — measured 2026-09-12: the old recipe produced
 * `postgresql:/run_insights_itest_owner:…/neondb`, and the migrate spun on a hostless URL.
 *
 * The terminate is not optional: the pooler holds connections open and `DROP DATABASE` fails with
 * "is being accessed by other users" without it.
 *
 * ── THIS IS THE BRANCH A SHAPE ────────────────────────────────────────────────────────────────
 * Phase 2's probe measured Vercel Fluid compute holding 90.418 s on a `maxDuration = 300` segment
 * in `sin1` — production's own region — and an `after()` callback ticking on to `heldMs 90030`
 * with the connection closed after a 1.25 s flush. So the generator moved in-platform and the
 * doorbell is gone: there is no `lib/nina/imagedispatch.ts`, no `GITHUB_DISPATCH_TOKEN`, no
 * `workflow_dispatch` POST and nothing that writes `error_code = 'dispatched'`. Deltas A1-A6 of
 * this phase's plan are applied; the Branch B shape its Step 1 spells out is NOT written.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ────────────────────────────────────────────────────
 * The model's DECISION to call `set_avatar` is scripted, and the OpenRouter image call is routed to
 * a stub. Everything else is the shipping code: the turn loop, `NINA_FULL_TOOL_SET`,
 * `handleSetAvatar`'s in-flight guard, the quota check, `buildNinaImagePrompt`, `openNinaImageJob`,
 * `fireNinaImageGeneration`'s `after()` handoff, `claimNinaImageJob`, `storeNinaImage`'s real Blob
 * `put`, `finishAvatar`'s batched un-current-then-insert, `finishSelfie`'s three writes,
 * `closeFailed`'s retry and terminal branches, and `getCurrentNinaAvatar` — the read the chat
 * header, `/nina/about` and `/admin` all perform. The live twin
 * (`tests/live/ninaImageE2E.live.test.ts`) buys the two things scripted away here, and spends
 * $0.04 to do it.
 *
 * ── WHY THE BLOB IS REAL WHEN OPENROUTER IS NOT ───────────────────────────────────────────────
 * `@vercel/blob` imports `fetch` from `undici` (dist/index.js:90), not `globalThis.fetch`.
 * `vi.stubGlobal('fetch', …)` cannot see it. A 70-byte upload is free, is `del`eted in `afterAll`,
 * and proves `storeNinaImage`'s pathname, content type and `allowOverwrite` against the real API
 * rather than against our idea of it. `callNinaImageModel` DOES use the global, which is what lets
 * the router below intercept the one call that costs money.
 *
 * ── THE DAILY CAP ─────────────────────────────────────────────────────────────────────────────
 * `NINA_IMAGE_DAILY_CAP` (30 at this writing) and `countNinaTurnsSince` counts failures too, so a suite that opens
 * jobs can exhaust a quota. It cannot exhaust the OPERATOR's: the cap is `WHERE user_id = $1` and
 * every row here belongs to a user created in `beforeAll` and deleted in `afterAll`. Three image
 * jobs are opened in total. Do not add a fourth case without counting again.
 *
 * ── THE THREE MEASURED DEFECTS, EACH WITH THE ASSERTION THAT CATCHES IT ───────────────────────
 *   Finding 1 (a `nina_messages` write with no `session_id`) — the two SELFIE cases. The AVATAR
 *     case does NOT cover it and cannot: `finishAvatar` writes no message at all, which this file
 *     asserts positively so nobody later mistakes the gap for coverage.
 *   Finding 2 (a job the dispatch grace window makes unclaimable) — NOT reachable on this path,
 *     and deliberately not faked. There is no grace window in-platform: `runNinaImageJob` claims a
 *     `queued` row named by the invocation that opened it. Finding 2's regression is phase 1's
 *     `dispatchCutoffFor` / `claimJob` unit tests, which still guard the two things that ARE still
 *     live — the manual `--job` drain of the 15 historical `dispatched` rows, and the GitHub
 *     backstop that is phase 2's rollback target.
 *   Finding 1's blast radius (money spent, `cost_micro_usd` NULL or under-reported) — case 3.
 */

/* ── Gates ─────────────────────────────────────────────────────────────────────────────────── */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN
/* `tests/support/setup.ts` fills this with a sentinel so unit tests can import the modules. It is
 * not a credential and must not be mistaken for one — the same shape `nina.live.test.ts` uses to
 * reject `'unit-test-key-never-sent'`. */
const HAS_BLOB =
  BLOB_TOKEN != null && BLOB_TOKEN !== '' && BLOB_TOKEN !== 'vercel_blob_rw_unit_test'
const enabled = Boolean(TEST_DATABASE_URL) && HAS_BLOB

// lib/db/index.ts reads DATABASE_URL at import time, so it must be pointed at the test database
// BEFORE the dynamic imports in beforeAll. Same ordering rule as queries.int.test.ts.
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

/*
 * A2: `ninaEnv()` is a ONE-MEMBER group after phase 2 — `{ OPENROUTER_API_KEY }` — because the
 * doorbell and its token were deleted with `lib/nina/imagedispatch.ts`. `callNinaImageModel` reads
 * the key through `ninaEnv()` BEFORE the fetch and turns a throw into a `transport` failure with
 * `costMicroUsd: 0`, which would quietly skip the provider call this suite asserts on.
 * `tests/support/setup.ts` deliberately does not stub the nina group, so it is stubbed here. The
 * value is never sent anywhere: the router below answers `OPENROUTER_IMAGE_URL` itself.
 */
process.env.OPENROUTER_API_KEY ??= 'itest-openrouter-key-never-sent'

/* ── `after()` ─────────────────────────────────────────────────────────────────────────────── */

/**
 * **A4. On Branch A the collected callback IS the generation, not a doorbell.**
 * `fireNinaImageGeneration` registers `runNinaImageJob` inside `after()`. The test must NOT drain
 * it — draining would run the generation twice against one row, and the second run would return
 * `'none'` against assertions reading a job the test did not drive. So the callbacks are collected,
 * asserted to exist (the handoff really happened), and dropped; the test then drives the awaitable
 * itself so it owns the ordering.
 *
 * `vi.hoisted` because `vi.mock`'s factory is hoisted above every declaration in this file. `after`
 * is the only `next/server` import anywhere in the graph this suite loads.
 */
const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }))
vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

/** The handoff happened, and this process is the only thing that will run it. */
function expectHandedOff(): void {
  expect(deferred.length).toBeGreaterThan(0)
  deferred.length = 0
}

/* ── The network router ────────────────────────────────────────────────────────────────────── */

const realFetch = globalThis.fetch.bind(globalThis)
/* The database NEVER goes through the stub. `neonConfig.fetchFunction` is the same seam
 * `queries.int.test.ts` uses to count round trips. */
neonConfig.fetchFunction = (input: unknown, init: unknown) =>
  realFetch(input as string, init as RequestInit)

/** A valid 1x1 PNG. Small enough to be free, real enough for `put` to accept. */
const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function okImageReply(): { status: number; body: string } {
  return {
    status: 200,
    body: JSON.stringify({ data: [{ b64_json: PNG_1X1_B64 }], usage: { cost: 0.04 } }),
  }
}

/**
 * A 200 with no image: the provider was reached, the money was spent, nothing came back. The exact
 * shape of the two production jobs that logged 55.6 s and 73.9 s and stored NULL. It carries no
 * refusal wording, so `classifyImageFailure` calls it `transport` and not `policy`.
 */
function emptyImageReply(): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ data: [], usage: { cost: 0.04 } }) }
}

let openRouterReply = okImageReply()
const openRouterCalls: Array<Record<string, unknown>> = []

function installFetchRouter(): void {
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

      if (url.startsWith(OPENROUTER_IMAGE_URL)) {
        openRouterCalls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return new Response(openRouterReply.body, { status: openRouterReply.status })
      }
      if (url.startsWith('https://api.github.com/')) {
        /* A3 — INVARIANT 4, and STRONGER than the payload check this replaces. There is no
         * doorbell any more: `lib/nina/imagedispatch.ts` and `GITHUB_DISPATCH_TOKEN` are both
         * gone, and the generation runs on this invocation. So the honest assertion is not "the
         * dispatch input carries only an opaque nanoid" but "the public repository is never
         * contacted at all". A regression that reintroduced a dispatch would fail here loudly
         * rather than quietly publishing a scene description to a world-readable Actions log. */
        throw new Error(`[nina e2e] Branch A must not dispatch to GitHub: ${url}`)
      }
      /* Belt and braces: `@vercel/blob` uses undici's fetch today and never reaches this stub, but
       * a future version that switches to the global must still upload rather than throw. */
      if (url.includes('.vercel-storage.com')) return realFetch(input, init)

      throw new Error(`[nina e2e] unexpected network call: ${url}`)
    },
  )
}

/* ── Fixtures and handles ──────────────────────────────────────────────────────────────────── */

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const U1 = `itest-nina-${SUFFIX}`

const AVATAR_SCENE = 'duduk di kafe pagi-pagi, rambut diikat, senyum tipis'
const SELFIE_SCENE = 'habis lari sore di GBK, muka masih merah, botol minum di tangan'
const FAILING_SCENE = 'di parkiran, lampu jingga, jaket dilepas'

/** Real DB round trips plus a real Blob upload; vitest's non-live default is 5 s. */
const CASE_TIMEOUT_MS = 60_000

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
type NinaQueries = typeof import('@/lib/nina/queries')
type Turn = typeof import('@/lib/nina/turn')
type AvatarTools = typeof import('@/lib/nina/avatartools')
type Fixtures = typeof import('@/tests/fixtures/ninaTurn')
type ImageRun = typeof import('@/lib/nina/imagerun')
type Blob = typeof import('@vercel/blob')

let db: Db
let s: Schema
let q: NinaQueries
let turn: Turn
let avatarTools: AvatarTools
let fx: Fixtures
let imagerun: ImageRun
let blob: Blob

/** The Blob objects this run created, deleted in `afterAll` so nothing is orphaned. */
const blobUrls: string[] = []

/** The pre-existing face, so the un-currenting is a real state change and not a first insert. */
let seedAvatarId = ''
/** Where he asked for the selfie. */
let sessionB = ''
/** A NEWER session with activity. The fallback would pick this; the correct answer is B. */
let sessionC = ''
let sessionA = ''

/**
 * **A1 — the in-platform entry point.** `runNinaImageJob(userId, jobId, opts?)` performs claim →
 * call → store → finish and returns the same four values `scripts/nina-image-worker.ts`'s
 * `runOneJob` did, so every assertion on its result ported over unchanged.
 *
 * **One thing did NOT port, and case 3 is where it shows.** `runNinaImageJob` owns its own retry
 * loop — a fast failure is reclaimed on the SAME invocation while the wall clock can still hold a
 * whole `NINA_IMAGE_CALL_TIMEOUT_MS` plus the finish writes. Against a stubbed provider that
 * answers instantly, both attempts are therefore spent inside ONE call, which returns `'gave-up'`.
 * The worker returned `'retry'` and had to be called twice. See case 3.
 */
async function runGenerator(jobId: string): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  return imagerun.runNinaImageJob(U1, jobId)
}

/** The newest image job of this user's, with its args already narrowed. */
async function newestImageJob(): Promise<{
  id: string
  status: string
  errorCode: string | null
  latencyMs: number | null
  costMicroUsd: number | null
  args: NinaImageJobArgs
}> {
  const rows = await db
    .select({
      id: s.ninaTurns.id,
      status: s.ninaTurns.status,
      errorCode: s.ninaTurns.errorCode,
      latencyMs: s.ninaTurns.latencyMs,
      costMicroUsd: s.ninaTurns.costMicroUsd,
      args: s.ninaTurns.args,
      createdAt: s.ninaTurns.createdAt,
    })
    .from(s.ninaTurns)
    .where(and(eq(s.ninaTurns.userId, U1), eq(s.ninaTurns.kind, 'image')))
    .orderBy(s.ninaTurns.createdAt)

  const row = rows[rows.length - 1]
  if (row == null) throw new Error('no image job was opened')
  return { ...row, args: row.args as NinaImageJobArgs }
}

async function readTurn(jobId: string) {
  const [row] = await db
    .select({
      id: s.ninaTurns.id,
      status: s.ninaTurns.status,
      errorCode: s.ninaTurns.errorCode,
      latencyMs: s.ninaTurns.latencyMs,
      costMicroUsd: s.ninaTurns.costMicroUsd,
      args: s.ninaTurns.args,
    })
    .from(s.ninaTurns)
    .where(and(eq(s.ninaTurns.userId, U1), eq(s.ninaTurns.id, jobId)))
  if (row == null) throw new Error(`no turn row for ${jobId}`)
  return { ...row, args: row.args as NinaImageJobArgs }
}

/**
 * One scripted turn: she calls `tool`, is told what happened, and then says something. The tool set
 * is `NINA_FULL_TOOL_SET` — the same object `lib/nina/turnrun.ts` passes — so this drives the real
 * dispatch table and the real handler, and only the model's token stream is fabricated.
 */
async function scriptedTurn(input: {
  tool: 'set_avatar' | 'generate_image'
  toolInput: Record<string, unknown>
  sessionId: string
  sourceMessageId: string | null
  runnerText: string
}): Promise<void> {
  const result = await turn.runNinaTurnWith(
    fx.fakeTurnDeps(
      fx.scriptedClient([
        fx.toolUseMessage(input.tool, input.toolInput),
        fx.sendMessage({ bubbles: ['bentar ya, gw ambil dulu'] }),
      ]),
      { toolSet: avatarTools.NINA_FULL_TOOL_SET },
    ),
    {
      userId: U1,
      context: fx.ninaContextFixture(),
      tuning: fx.ninaTuningFixture(),
      history: fx.runHistoryFixture(),
      sourceMessageId: input.sourceMessageId,
      runnerText: input.runnerText,
    },
  )

  expect(result.source).not.toBe('unavailable')
  expect(result.payload?.bubbles.length ?? 0).toBeGreaterThan(0)

  /* Her bubbles, persisted the way `lib/nina/actions/send.ts` persists them, so the conversation this
   * test asserts against is a real one. */
  await q.insertNinaMessages(
    U1,
    (result.payload?.bubbles ?? []).map((body, index) => ({
      role: 'nina' as const,
      body,
      replyToId: index === 0 ? input.sourceMessageId : null,
    })),
    input.sessionId,
  )
}

/**
 * **Make session C the answer the A3 FALLBACK would give, at the moment the generator resolves.**
 *
 * `resolveNinaWriteSession` is `ensureNinaSession`, which is `mostRecentNinaSession` over sessions
 * ranked by LAST ACTIVITY — not by creation. So seeding C in `beforeAll` does not make it the
 * fallback's answer: the case itself writes the runner's question and Nina's bubbles into B
 * moments later, which puts B on top. Called here, one line before the generator runs, C is
 * unambiguously the most recent and only a resolver that reads the session off `args.replyToId`
 * can still answer B.
 *
 * MEASURED: without this, deleting `finishSelfie`'s `quoted?.sessionId ??` — the whole of Finding
 * 1's session-resolution fix — leaves the suite GREEN. With it, that mutation fails cases 2 and 3.
 */
async function makeCFallbackWin(): Promise<void> {
  await q.insertNinaMessages(
    U1,
    [{ role: 'runner', body: 'eh btw, ngobrol di sini dulu' }],
    sessionC,
  )
}

/* ── The suite ─────────────────────────────────────────────────────────────────────────────── */

describe.skipIf(!enabled)('nina image pipeline, end to end, against a real database', () => {
  beforeAll(async () => {
    db = (await import('@/lib/db/index')).db
    s = await import('@/lib/db/schema')
    q = await import('@/lib/nina/queries')
    turn = await import('@/lib/nina/turn')
    avatarTools = await import('@/lib/nina/avatartools')
    fx = await import('@/tests/fixtures/ninaTurn')
    imagerun = await import('@/lib/nina/imagerun')
    blob = await import('@vercel/blob')

    installFetchRouter()

    await db
      .insert(s.users)
      .values([{ id: U1, name: 'Fixture Runner', email: `${U1}@example.test` }])

    /*
     * The face she already has. `source: 'admin'` matters twice: it is what production actually
     * holds (13 rows, all admin), and it is what makes `handleSetAvatar`'s in-flight guard pass —
     * that guard refuses only when the CURRENT avatar is `generated` AND unannounced.
     */
    seedAvatarId = newId()
    await db.insert(s.ninaAvatars).values({
      id: seedAvatarId,
      userId: U1,
      blobUrl: 'https://example.invalid/seed-face.png',
      pathname: `nina/${U1}/avatar-seedseedseed.png`,
      source: 'admin',
      isCurrent: true,
      width: 768,
      height: 1024,
      bytes: 4096,
      description: 'the seeded face',
      announcedAt: new Date(),
    })

    sessionA = (await q.createNinaSession(U1)).id
    sessionB = (await q.createNinaSession(U1)).id
    sessionC = (await q.createNinaSession(U1)).id
    /* C starts with activity, but see `makeCFallbackWin` — the A3 fallback ranks by LAST
     * ACTIVITY, so seeding C here is not on its own enough to make it the fallback's answer. */
    await q.insertNinaMessages(U1, [{ role: 'runner', body: 'ngobrol lain' }], sessionC)
  }, 60_000)

  afterAll(async () => {
    if (!enabled) return
    for (const url of blobUrls) {
      try {
        await blob.del(url, { token: BLOB_TOKEN })
      } catch (cause) {
        console.warn('[nina e2e] could not delete a test blob', { url, error: String(cause) })
      }
    }
    await db.delete(s.users).where(eq(s.users.id, U1))
    vi.unstubAllGlobals()
  }, 60_000)

  /* ══ R5 ═════════════════════════════════════════════════════════════════════════════════════ */

  it(
    'R5: a set_avatar turn changes the profile picture the app actually reads',
    async () => {
      openRouterReply = okImageReply()
      openRouterCalls.length = 0

      const [asked] = await q.insertNinaMessages(
        U1,
        [{ role: 'runner', body: 'na, ganti foto profil lo dong' }],
        sessionA,
      )
      expect(asked).toBeDefined()

      /* ── The chat half. Only the model's decision is fabricated. ───────────────────────────── */
      await scriptedTurn({
        tool: 'set_avatar',
        toolInput: { scene: AVATAR_SCENE, because: 'dia minta gw ganti foto profil' },
        sessionId: sessionA,
        sourceMessageId: asked?.id ?? null,
        runnerText: 'na, ganti foto profil lo dong',
      })

      /* ── The job the handler opened. ───────────────────────────────────────────────────────── */
      const opened = await newestImageJob()
      expect(opened.status).toBe('pending')
      expect(opened.errorCode).toBe('queued')
      expect(opened.args.purpose).toBe('avatar')
      expect(opened.args.source).toBe('generated')
      expect(opened.args.scene).toBe(AVATAR_SCENE)
      expect(opened.args.prompt).toContain(AVATAR_SCENE)
      expect(typeof opened.args.seed).toBe('number')
      /* Nobody asked in a bubble the photo can quote: an avatar job has no reply target. */
      expect(opened.args.replyToId).toBeNull()
      expect(opened.args.attempts).toBe(0)

      /* ── A4. The work was handed to the SERVER, not to a runner. ───────────────────────────── */
      expectHandedOff()

      /*
       * A5 — the row is `queued`, not `dispatched`, when the generator is called. Nothing writes
       * 'dispatched' any more; phase 2 deleted both writers. A queued row claimed by the
       * invocation that opened it is the whole shape of the in-platform design, and the absence of
       * a grace window is why Finding 2 cannot recur on this path.
       */
      const beforeRun = await readTurn(opened.id)
      expect(beforeRun.errorCode).toBe('queued')

      expect(await runGenerator(opened.id)).toBe('ok')

      /* The prompt stored in `args` is the prompt as SENT — which is what phase 4's "exact prompt"
       * page will claim, and what a reproducible seed is worth. */
      expect(openRouterCalls).toHaveLength(1)
      expect(openRouterCalls[0]).toMatchObject({
        model: NINA_IMAGE_MODEL,
        prompt: opened.args.prompt,
        resolution: '1K',
        aspect_ratio: '3:4',
        n: 1,
        seed: opened.args.seed,
      })
      expect(openRouterCalls[0]?.input_references).toBeUndefined()

      /* ── The job is TERMINAL, and the money is on the ledger. ──────────────────────────────── */
      const closed = await readTurn(opened.id)
      expect(closed.status).toBe('ok')
      expect(closed.errorCode).toBeNull()
      expect(closed.latencyMs).not.toBeNull()
      /* Invariant 9. `usage.cost: 0.04` came back, so this is the REPORTED cost and not the
       * fallback constant — the two happen to agree, which is the measured price. */
      expect(closed.costMicroUsd).toBe(NINA_IMAGE_COST_MICRO_USD)
      /* It really was claimed, once. 15 of production's 18 jobs sit at 0 forever. */
      expect(closed.args.attempts).toBe(1)

      /* ── The tail nobody checks: exactly one current face. ─────────────────────────────────── */
      const currents = await db
        .select()
        .from(s.ninaAvatars)
        .where(and(eq(s.ninaAvatars.userId, U1), eq(s.ninaAvatars.isCurrent, true)))
      /* `nina_avatars_user_current_unq` is a PARTIAL unique index on (user_id) where is_current, so
       * two rows here would mean the batch's statement order stopped being load-bearing. */
      expect(currents).toHaveLength(1)

      const current = currents[0]
      expect(current).toBeDefined()
      if (current == null) return
      expect(current.id).not.toBe(seedAvatarId)
      expect(current.source).toBe('generated')
      /* NULL is phase 10's `avatar_changed` trigger. A stamped value here means she will never
       * mention the new face. */
      expect(current.announcedAt).toBeNull()
      expect(current.description).toBe(AVATAR_SCENE)
      expect(current.width).toBe(NINA_IMAGE_WIDTH)
      expect(current.height).toBe(NINA_IMAGE_HEIGHT)
      expect(current.bytes).toBeGreaterThan(0)
      expect(current.blobUrl.startsWith('https://')).toBe(true)
      /* The STORED pathname carries Vercel's random suffix, so it is deliberately NOT matched
       * against `NINA_IMAGE_PATHNAME_RE` — that regex describes the REQUESTED name. */
      expect(current.pathname.startsWith(`nina/${U1}/avatar-`)).toBe(true)
      blobUrls.push(current.blobUrl)

      const [previous] = await db
        .select()
        .from(s.ninaAvatars)
        .where(eq(s.ninaAvatars.id, seedAvatarId))
      expect(previous?.isCurrent).toBe(false)

      /* ── THE REQUIREMENT, in the exact read the app performs. ──────────────────────────────── */
      const seen = await q.getCurrentNinaAvatar(U1)
      expect(seen?.id).toBe(current.id)
      expect(seen?.blobUrl).toBe(current.blobUrl)
      expect(seen?.source).toBe('generated')

      /* ── And the negative that documents WHY this case cannot cover Finding 1. ─────────────── */
      const messagesFromJob = await db
        .select()
        .from(s.ninaMessages)
        .where(and(eq(s.ninaMessages.userId, U1), eq(s.ninaMessages.turnId, opened.id)))
      expect(messagesFromJob).toHaveLength(0)
    },
    CASE_TIMEOUT_MS,
  )

  /* ══ FINDING 1 — the success branch ══════════════════════════════════════════════════════════ */

  it(
    'Finding 1: a generated selfie lands in the session he asked in, with session_id written',
    async () => {
      openRouterReply = okImageReply()
      openRouterCalls.length = 0

      const [asked] = await q.insertNinaMessages(
        U1,
        [{ role: 'runner', body: 'na, foto dong abis lari' }],
        sessionB,
      )
      expect(asked).toBeDefined()

      await scriptedTurn({
        tool: 'generate_image',
        toolInput: { scene: SELFIE_SCENE, mood: 'capek tapi senang' },
        sessionId: sessionB,
        sourceMessageId: asked?.id ?? null,
        runnerText: 'na, foto dong abis lari',
      })

      const opened = await newestImageJob()
      expect(opened.args.purpose).toBe('selfie')
      expect(opened.args.source).toBe('chat')
      expect(opened.args.replyToId).toBe(asked?.id)

      expectHandedOff()
      /* C becomes the most recently active session RIGHT NOW, so the fallback's answer and the
       * correct answer are genuinely different by the time the generator resolves one. */
      await makeCFallbackWin()
      expect(await runGenerator(opened.id)).toBe('ok')

      const closed = await readTurn(opened.id)
      expect(closed.status).toBe('ok')
      expect(closed.costMicroUsd).toBe(NINA_IMAGE_COST_MICRO_USD)

      const [photo] = await db
        .select()
        .from(s.ninaMessages)
        .where(and(eq(s.ninaMessages.userId, U1), eq(s.ninaMessages.turnId, opened.id)))
      expect(photo).toBeDefined()
      if (photo == null) return

      /*
       * **FINDING 1.** `nina_messages.session_id` is NOT NULL, so omitting it is a crash; and the
       * value has to be the session of `args.replyToId`, not the newest one. Session C exists and
       * is newer with activity, so a resolver that only falls back to "his most recent session"
       * writes C and fails here — which is the whole reason C is seeded.
       */
      expect(photo.sessionId).toBe(sessionB)
      expect(photo.sessionId).not.toBe(sessionC)
      expect(photo.role).toBe('nina')
      expect(photo.source).toBe('chat')
      expect(photo.replyToId).toBe(asked?.id)

      const [image] = await db
        .select()
        .from(s.ninaMessageImages)
        .where(and(eq(s.ninaMessageImages.userId, U1), eq(s.ninaMessageImages.messageId, photo.id)))
      expect(image).toBeDefined()
      if (image == null) return
      /* `nina_message_images` has had ZERO rows, of any kind, ever. This assertion is the one that
       * makes that impossible to regress. */
      expect(image.kind).toBe('generated')
      expect(image.description).toBe(SELFIE_SCENE)
      /* The row IS the sidecar — prompt as sent, model, seed. */
      expect(image.prompt).toBe(opened.args.sidecar)
      expect(image.width).toBe(NINA_IMAGE_WIDTH)
      expect(image.height).toBe(NINA_IMAGE_HEIGHT)
      expect(image.bytes).toBeGreaterThan(0)
      expect(image.blobUrl.startsWith('https://')).toBe(true)
      expect(image.pathname.startsWith(`nina/${U1}/selfie-`)).toBe(true)
      blobUrls.push(image.blobUrl)
    },
    CASE_TIMEOUT_MS,
  )

  /* ══ FINDING 1's BLAST RADIUS + INVARIANT 9 ══════════════════════════════════════════════════ */

  it(
    'Finding 1 + invariant 9: a terminal failure apologises WITH a session and records BOTH bills',
    async () => {
      /* A 200 with no image: the provider was reached and billed, and nothing came back. */
      openRouterReply = emptyImageReply()
      openRouterCalls.length = 0

      const [asked] = await q.insertNinaMessages(
        U1,
        [{ role: 'runner', body: 'satu lagi dong' }],
        sessionB,
      )
      expect(asked).toBeDefined()

      await scriptedTurn({
        tool: 'generate_image',
        toolInput: { scene: FAILING_SCENE },
        sessionId: sessionB,
        sourceMessageId: asked?.id ?? null,
        runnerText: 'satu lagi dong',
      })

      const opened = await newestImageJob()
      expectHandedOff()
      await makeCFallbackWin()

      /*
       * **ONE CALL BURNS BOTH ATTEMPTS, AND THAT IS THE IN-PLATFORM SHAPE.**
       *
       * The GitHub worker's `runOneJob` returned `'retry'` and had to be invoked a second time by
       * the next workflow run. `runNinaImageJob` owns the retry itself: `closeFailed` requeues
       * while `attempts < NINA_IMAGE_MAX_ATTEMPTS`, and the loop reclaims on the SAME invocation
       * whenever a whole `NINA_IMAGE_CALL_TIMEOUT_MS` plus `NINA_IMAGE_FINISH_RESERVE_MS` still
       * fits inside `NINA_IMAGE_RUN_BUDGET_MS`. Against a stub that answers instantly it always
       * does, so both attempts are spent here and the call returns `'gave-up'`.
       *
       * That is a REAL behavioural difference between the hosts, not a test convenience — a fast
       * failure now costs the runner one wait instead of two workflow schedules. The plan's
       * two-call shape was written against the worker (Branch B).
       */
      expect(await runGenerator(opened.id)).toBe('gave-up')

      /* Both attempts really reached the provider. This is what makes the ledger assertion below
       * a statement about two bills rather than about one number. */
      expect(openRouterCalls).toHaveLength(NINA_IMAGE_MAX_ATTEMPTS)

      const closed = await readTurn(opened.id)
      expect(closed.status).toBe('failed')
      expect(closed.errorCode).toBe('transport')
      expect(closed.args.attempts).toBe(NINA_IMAGE_MAX_ATTEMPTS)
      /*
       * **INVARIANT 9, AND THE NUMBER IS TWO GENERATIONS, NOT ONE.**
       *
       * `cost_micro_usd` is a per-JOB CUMULATIVE TOTAL across attempts, reconciled across phases
       * 1, 2, 4 and 7 (plan index *Decisions*, rung 1). Every writer accumulates:
       * `requeueNinaImageJob`, `failNinaImageJob` and `completeNinaImageJob` in-platform, and the
       * worker's `closeFailed` / `finishSelfie` / `finishAvatar` on the backstop. `stale` leaves
       * the column untouched rather than nulling a spend a retry already recorded.
       *
       * If this fails with `40000`, a retry branch somewhere stopped accumulating and one
       * generation has vanished from the ledger. If it fails with `null`, the terminal UPDATE was
       * swallowed by the apology INSERT — which is the exact bug that took the process down.
       */
      expect(closed.costMicroUsd).toBe(NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_COST_MICRO_USD)
      expect(closed.latencyMs).not.toBeNull()

      const [apology] = await db
        .select()
        .from(s.ninaMessages)
        .where(and(eq(s.ninaMessages.userId, U1), eq(s.ninaMessages.turnId, opened.id)))
      expect(apology).toBeDefined()
      if (apology == null) return
      /* **FINDING 1, the branch that took the whole process down.** */
      expect(apology.sessionId).toBe(sessionB)
      expect(apology.sessionId).not.toBe(sessionC)
      expect(apology.role).toBe('nina')
      /* Invariant 7: the only sanctioned in-character strings are `imagefail.ts`'s. No app-authored
       * prose may render as her bubble. */
      expect(apology.text).toBe(ninaImageApology('transport', opened.id))

      /* Nothing was stored, so nothing to reap. */
      const images = await db
        .select()
        .from(s.ninaMessageImages)
        .where(
          and(eq(s.ninaMessageImages.userId, U1), eq(s.ninaMessageImages.messageId, apology.id)),
        )
      expect(images).toHaveLength(0)
    },
    CASE_TIMEOUT_MS,
  )

  /* ══ The one line of `lib/nina/actions.ts` this suite cannot drive ═══════════════════════════ */

  it('the full tool set the chat action passes carries both image tools', () => {
    /*
     * The action's whole contribution to R5 is which tool set it hands `runNinaTurn`. This suite
     * drives `NINA_FULL_TOOL_SET` directly rather than through `sendNinaMessage` — after phase 3
     * the turn runs in a durable background task that is deliberately not exported, so awaiting the
     * action no longer awaits the turn — so this asserts the object itself is complete.
     * `extendToolSet` throws at module load on a duplicate, so the layering cannot silently drop
     * one; a REPLACED set could, and that is what this catches.
     */
    const names = avatarTools.NINA_FULL_TOOL_SET.tools.map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(['set_avatar', 'generate_image']))
    expect(Object.keys(avatarTools.NINA_FULL_TOOL_SET.handlers)).toEqual(
      expect.arrayContaining(['set_avatar', 'generate_image']),
    )
    /*
     * **`send` is in `tools` and deliberately NOT in `handlers`.** It is the TERMINAL tool: the
     * turn loop consumes the `send` block itself and stops, so a dispatch-table entry for it would
     * be an entry nothing can ever reach. `NINA_CORE_TOOL_SET` declares it first because
     * `tools.ts` wants it "the most available thing in the list", and that ordering is what this
     * pins — she must always be able to end a turn by speaking, whatever the layering adds above.
     */
    expect(names[0]).toBe('send')
    expect(avatarTools.NINA_FULL_TOOL_SET.handlers).not.toHaveProperty('send')
  })
})
