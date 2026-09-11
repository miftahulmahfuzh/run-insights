// MUST be first: it loads .env.local before any import below reaches lib/env.ts, which parses
// process.env eagerly. Same ordering rule as tests/live/nina.live.test.ts.
import './loadEnvLocal'

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { newId } from '@/lib/id'
import { NINA_IMAGE_HEIGHT, NINA_IMAGE_WIDTH, type NinaImageJobArgs } from '@/lib/nina/imagerecipe'

/**
 * **R5 with the money on.** The two things `tests/integration/ninaImageE2E.int.test.ts` scripts
 * away, bought for real:
 *
 *   1. that `glm-5.3`, handed a plain Indonesian request and `NINA_FULL_TOOL_SET`, actually reaches
 *      for `set_avatar` — the integration suite fabricates that decision;
 *   2. that `qwen/qwen-image-3-pro` accepts the prompt `buildNinaImagePrompt` assembles and returns
 *      bytes — the integration suite routes the call to a stub.
 *
 * **WHAT ONE RUN COSTS:** one `glm-5.3` chat turn (~15 s) plus one image generation at **$0.040**
 * (~78 s measured), one Blob object (deleted in `afterAll`), and one of the throwaway user's six
 * daily image slots. The OPERATOR's quota is untouched — the cap is `WHERE user_id = $1` and this
 * user is created and destroyed by the suite.
 *
 *     LLM_LIVE_TEST=1 TEST_DATABASE_URL=<neon branch> npm run test:live:nina-image
 *
 * ── FOUR GATES, AND CI SETS NONE OF THEM ──────────────────────────────────────────────────────
 * `vitest.config.ts` excludes `tests/live/**` unless `LLM_LIVE_TEST=1`, and the `describe.skipIf`
 * below additionally demands `TEST_DATABASE_URL`, a real `LLM_API_KEY` and a real
 * `OPENROUTER_API_KEY` / `BLOB_READ_WRITE_TOKEN` — each checked against the sentinel
 * `tests/support/setup.ts` fills it with. Nothing is spent and nothing is written by accident.
 *
 * ── THE `.env.local` HAZARD, AND THE GUARD AGAINST IT ─────────────────────────────────────────
 * `./loadEnvLocal` loads `.env.local` with `override: true`, and `.env.local` carries the
 * PRODUCTION `DATABASE_URL`. This file therefore captures that value BEFORE overriding it, and
 * refuses to run unless `TEST_DATABASE_URL` is set and is a DIFFERENT database. Every production
 * module is imported dynamically inside `beforeAll`, after the override, for the same reason
 * `queries.int.test.ts` does it.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
 * It never lets the platform run the generation. `after()` is collected and never drained, so the
 * job stays `queued` and this process is the only generator that touches it. On Branch A the
 * collected callback IS `runNinaImageJob` — so `deferred.length > 0` proves the handoff happened
 * and that the test, not the platform, is the thing driving it.
 */

/* Captured BEFORE the override below, so the guard can compare. */
const DOTENV_DATABASE_URL = process.env.DATABASE_URL
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

function realKey(value: string | undefined, ...sentinels: string[]): boolean {
  return value != null && value !== '' && !sentinels.includes(value)
}

const enabled =
  TEST_DATABASE_URL != null &&
  TEST_DATABASE_URL !== '' &&
  TEST_DATABASE_URL !== DOTENV_DATABASE_URL &&
  realKey(process.env.LLM_API_KEY, 'unit-test-key-never-sent', 'ci-dummy-key') &&
  realKey(process.env.OPENROUTER_API_KEY) &&
  realKey(process.env.BLOB_READ_WRITE_TOKEN, 'vercel_blob_rw_unit_test')

if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

/** `fireNinaImageGeneration` schedules the generation in `after()`. Collected, never drained. */
const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }))
vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const U1 = `live-nina-${SUFFIX}`
/** Unambiguous on purpose. The 2026-09 probe measured this endpoint honouring a tool round trip. */
const ASK = 'na, ganti foto profil lo dong. yang lagi duduk di kafe, pagi-pagi, rambut diikat.'

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

const blobUrls: string[] = []
let seedAvatarId = ''
let sessionId = ''

describe.skipIf(!enabled)('nina image pipeline, live', () => {
  beforeAll(async () => {
    db = (await import('@/lib/db/index')).db
    s = await import('@/lib/db/schema')
    q = await import('@/lib/nina/queries')
    turn = await import('@/lib/nina/turn')
    avatarTools = await import('@/lib/nina/avatartools')
    fx = await import('@/tests/fixtures/ninaTurn')
    imagerun = await import('@/lib/nina/imagerun')
    blob = await import('@vercel/blob')

    await db.insert(s.users).values([{ id: U1, name: 'Live Runner', email: `${U1}@example.test` }])

    /* `source: 'admin'` so `handleSetAvatar`'s in-flight guard passes. */
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

    sessionId = (await q.createNinaSession(U1)).id
  }, 60_000)

  afterAll(async () => {
    if (!enabled) return
    for (const url of blobUrls) {
      try {
        await blob.del(url, { token: process.env.BLOB_READ_WRITE_TOKEN })
      } catch (cause) {
        console.warn('[nina live] could not delete a test blob', { url, error: String(cause) })
      }
    }
    await db.delete(s.users).where(eq(s.users.id, U1))
  }, 60_000)

  it('live: she really calls set_avatar, the camera really runs, and the profpic really changes', async () => {
    const [asked] = await q.insertNinaMessages(U1, [{ role: 'runner', body: ASK }], sessionId)
    expect(asked).toBeDefined()

    /* ── The REAL model, the REAL tool set, the REAL handler. ─────────────────────────────── */
    const result = await turn.runNinaTurnWith(
      fx.fakeTurnDeps(turn.ninaClient(), {
        model: await turn.ninaModel(),
        toolSet: avatarTools.NINA_FULL_TOOL_SET,
      }),
      {
        userId: U1,
        context: fx.ninaContextFixture(),
        tuning: fx.ninaTuningFixture(),
        history: fx.runHistoryFixture(),
        sourceMessageId: asked?.id ?? null,
        runnerText: ASK,
      },
    )
    expect(result.source).not.toBe('unavailable')

    /*
     * A failure HERE is a change at the endpoint or in the tool description, not a flake — the
     * same framing `tests/live/nina.live.test.ts` uses for its own tool round trip. If she stops
     * reaching for `set_avatar` on a request this direct, `SET_AVATAR_TOOL`'s description is the
     * thing that regressed.
     */
    const [job] = await db
      .select({
        id: s.ninaTurns.id,
        status: s.ninaTurns.status,
        errorCode: s.ninaTurns.errorCode,
        costMicroUsd: s.ninaTurns.costMicroUsd,
        latencyMs: s.ninaTurns.latencyMs,
        args: s.ninaTurns.args,
      })
      .from(s.ninaTurns)
      .where(and(eq(s.ninaTurns.userId, U1), eq(s.ninaTurns.kind, 'image')))
    expect(job, 'she did not call set_avatar').toBeDefined()
    if (job == null) return

    const args = job.args as NinaImageJobArgs
    expect(args.purpose).toBe('avatar')
    expect(args.source).toBe('generated')

    /* ── The REAL camera. $0.040, ~78 s. `after()` is never drained, so the platform never
     * starts a second generation against this row. */
    expect(deferred.length).toBeGreaterThan(0)
    expect(await imagerun.runNinaImageJob(U1, job.id)).toBe('ok')

    const [closed] = await db
      .select({
        status: s.ninaTurns.status,
        errorCode: s.ninaTurns.errorCode,
        costMicroUsd: s.ninaTurns.costMicroUsd,
        latencyMs: s.ninaTurns.latencyMs,
      })
      .from(s.ninaTurns)
      .where(and(eq(s.ninaTurns.userId, U1), eq(s.ninaTurns.id, job.id)))
    expect(closed?.status).toBe('ok')
    expect(closed?.errorCode).toBeNull()
    /* **Invariant 9, asserted by the test that spent the money.** */
    expect(closed?.costMicroUsd).not.toBeNull()
    console.info('[nina live] generation billed', {
      jobId: job.id,
      costMicroUsd: closed?.costMicroUsd,
      latencyMs: closed?.latencyMs,
    })

    /* ── The tail. ───────────────────────────────────────────────────────────────────────── */
    const currents = await db
      .select()
      .from(s.ninaAvatars)
      .where(and(eq(s.ninaAvatars.userId, U1), eq(s.ninaAvatars.isCurrent, true)))
    expect(currents).toHaveLength(1)
    const current = currents[0]
    if (current == null) return
    expect(current.id).not.toBe(seedAvatarId)
    expect(current.source).toBe('generated')
    expect(current.announcedAt).toBeNull()
    expect(current.width).toBe(NINA_IMAGE_WIDTH)
    expect(current.height).toBe(NINA_IMAGE_HEIGHT)
    expect(current.bytes).toBeGreaterThan(1000)
    blobUrls.push(current.blobUrl)

    /* The bytes are really there, at a URL a browser could load. */
    const head = await fetch(current.blobUrl, { method: 'GET', cache: 'no-store' })
    expect(head.ok).toBe(true)
    expect(head.headers.get('content-type')).toContain('image/png')

    const seen = await q.getCurrentNinaAvatar(U1)
    expect(seen?.id).toBe(current.id)
  }, 300_000)
})
