import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NINA_ABOUT_MEDIA_PAGE_COOKIE,
  NINA_ABOUT_MEDIA_PAGE_SIZE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PROFILE_PAGE_COOKIE,
  NINA_CHAT_PHOTO_PAGE_SIZE,
} from '@/lib/nina/album'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **`fetchNinaMediaPage` — R1's guard, asserted against the SQL the driver receives.**
 *
 * `/nina/about`'s Media tab must show exactly the photographs `/admin/nina?view=media` shows. Both
 * surfaces already read ONE function over ONE predicate (`listNinaMediaPhotos` /
 * `mediaCollectionScope`), so parity is not a question of scope — it is a question of whether the
 * caller's stride matches the read's ceiling. Until 2026-10-02 it did not:
 *
 *     listNinaMediaPhotos:  limit  = min(opts.limit ?? 48, NINA_CHAT_PHOTO_PAGE_SIZE), i.e. 48
 *     /nina/about passed:   limit  = NINA_ABOUT_PAGE_SIZE = 99   ->  silently clamped to 48
 *                           offset = (page - 1) * 99
 *
 * 48 rows handed back, 99 stepped over. Rows 48…98 of every window were fetched by no page, and
 * `ceil(total / 99)` drew no page number that would have reached them: of 596 Media rows, 336
 * reachable and **260 not**, over 7 drawn pages against the admin surface's 13.
 *
 * ── WHY THE DRIVER AND NOT A SPY ─────────────────────────────────────────────────────────────
 * The clamp happens INSIDE the read, after any `vi.fn()` on `listNinaMediaPhotos` would already
 * have recorded a perfectly innocent-looking `{ limit: 99, offset: 99 }`. The only witness that
 * cannot be fooled is the bound parameter list Postgres would receive, which is what
 * `tests/support/fakeDb` records — the same argument `tests/nina.avatarsPage.test.ts` makes for the
 * avatar ceiling, against the same fake, in the same shape.
 *
 * ── WHAT IS MOCKED, AND WHY ONLY THIS MUCH ───────────────────────────────────────────────────
 * `requireUserId` (next-auth) and `next/headers` (`cookies()` throws outside a request) are edges,
 * not subject. `lib/nina/queries` is deliberately NOT mocked: it IS the subject's other half. A
 * `'use server'` directive is an inert string under vitest, so the action module imports normally —
 * the note `tests/nina.galleryDelete.test.ts` already records for this same family of modules.
 */

const { cookieJar, requireUserId } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  requireUserId: vi.fn(),
}))

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value)
    },
  }),
}))

type Actions = typeof import('@/lib/nina/aboutPageActions')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const USER = 'usrAAAAAAAAA'

let fake: FakeDb
let actions: Actions

beforeEach(async () => {
  vi.resetModules()
  cookieJar.clear()
  requireUserId.mockReset().mockResolvedValue(USER)
  fake = installFakeDb()
  actions = await import('@/lib/nina/aboutPageActions')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/**
 * The page-of-rows statement, found by the clause that only it carries. `listNinaMediaPhotos` runs
 * its rows select and `countNinaMediaPhotos` concurrently in one `Promise.all`, and which of the
 * two the driver sees first is an implementation detail of that array's evaluation order — not
 * something this suite should pin. Nothing is enqueued: the fake answers an unqueued statement with
 * `[]`, which makes the count 0 and the page empty, and this suite asserts on neither.
 */
function rowsQuery(): { sql: string; params: unknown[] } {
  const found = fake.queries.find((query) => query.sql.includes(' limit '))
  if (!found) {
    throw new Error(`no limited statement recorded:\n${fake.queries.map((q) => q.sql).join('\n')}`)
  }
  return found
}

describe('fetchNinaMediaPage — the stride Postgres is told equals the stride the pager draws', () => {
  it('page 1 asks for exactly NINA_ABOUT_MEDIA_PAGE_SIZE rows, and no offset at all', async () => {
    await actions.fetchNinaMediaPage(1)

    expect(fake.queries).toHaveLength(2)
    const rows = rowsQuery()
    // drizzle omits `offset` entirely at 0 — the avatar suite records the same behaviour.
    expect(rows.sql).not.toContain('offset $')
    expect(rows.params).toEqual([USER, NINA_ABOUT_MEDIA_PAGE_SIZE])
  })

  it('every later page offsets by exactly one page, never by a stride the read will clamp', async () => {
    /* 13 is the real top of today's collection: 596 rows / 48 = 12.42 -> 13 pages, the number
     * `/admin/nina?view=media` draws and the number the user quoted ("in Media, we have 13 pages
     * now"). Under the old 99-stride, page 13 would have asked for offset 1188 over a 596-row
     * table — a page that could only ever have been empty, if it had been drawn at all. */
    for (const page of [2, 3, 13]) {
      fake.reset()
      await actions.fetchNinaMediaPage(page)

      const rows = rowsQuery()
      expect(rows.params, `page ${page}`).toEqual([
        USER,
        NINA_ABOUT_MEDIA_PAGE_SIZE,
        NINA_ABOUT_MEDIA_PAGE_SIZE * (page - 1),
      ])
    }
  })

  it('the limit it asks for survives the read unclamped — the whole of the 2026-10-02 defect', async () => {
    await actions.fetchNinaMediaPage(2)

    const [, boundLimit, boundOffset] = rowsQuery().params
    // The number bound is the number the caller named. Under the old code the caller named 99 and
    // the driver was bound 48, while the offset went on advancing by 99.
    expect(boundLimit).toBe(NINA_ABOUT_MEDIA_PAGE_SIZE)
    expect(boundLimit).toBe(NINA_CHAT_PHOTO_PAGE_SIZE)
    expect(boundOffset).toBe(boundLimit)
    expect(boundLimit).not.toBe(NINA_ABOUT_PAGE_SIZE)
  })

  it('remembers the page under the MEDIA cookie, whose name carries the media size', async () => {
    await actions.fetchNinaMediaPage(4)

    expect(cookieJar.get(NINA_ABOUT_MEDIA_PAGE_COOKIE)).toBe('4')
    expect(NINA_ABOUT_MEDIA_PAGE_COOKIE).toContain(String(NINA_ABOUT_MEDIA_PAGE_SIZE))
    // The profile tab did not resize, so its cookie must not be touched or renamed by this action.
    expect(cookieJar.has(NINA_ABOUT_PROFILE_PAGE_COOKIE)).toBe(false)
  })

  it('a garbage page number still starts over at page 1 rather than erroring', async () => {
    // `clampNinaAboutPage` is the one sanitizer; this pins that the new stride did not bypass it.
    await actions.fetchNinaMediaPage(Number.NaN)

    expect(rowsQuery().params).toEqual([USER, NINA_ABOUT_MEDIA_PAGE_SIZE])
  })
})

describe('the ceiling that made the old stride silently wrong is still there', () => {
  it('listNinaMediaPhotos still clamps an over-asking caller — it just no longer has one', async () => {
    /* A read-only assertion on `lib/nina/queries/images.ts`, which this phase does not edit. It is
     * what makes the constant-binding in `lib/nina/album.ts` load-bearing rather than decorative:
     * ask for the profile tab's 99 here and Postgres is still told 48, with nothing logged. */
    const queries = await import('@/lib/nina/queries')
    await queries.listNinaMediaPhotos(USER, { limit: NINA_ABOUT_PAGE_SIZE, offset: 0 })

    const rows = rowsQuery()
    expect(rows.params).toEqual([USER, NINA_CHAT_PHOTO_PAGE_SIZE])
    expect(rows.params).not.toContain(NINA_ABOUT_PAGE_SIZE)
  })
})
