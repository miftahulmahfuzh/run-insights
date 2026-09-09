import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readRepoCode } from './support/importGraph'

/**
 * **The strip's two send paths, as the server action actually composes them (R1/R2).**
 *
 * Two halves, because the phase's surface is one action plus one screen:
 *
 *   1. `attachNinaPhotoToChat` with BOTH collaborators mocked at its edges — `sendNinaMessage`
 *      and `createNinaChatSession`. The claims that matter are the ones the plan index words as
 *      invariants: the recent send still carries `sessionId: null` (byte-identical resolution,
 *      and never a create), the new send creates FIRST and then names THAT session, and the
 *      destination comes back as a ready-to-push `next` spelled from the session the photograph
 *      landed in — not from the create's copy.
 *   2. the screen's wiring, as source claims — `environment: 'node'` cannot render a client
 *      component, so what is left is the shape: the words became `aria-label`s and no quoted
 *      literal survived, both targets are wired, both buttons share one flight, and the bare
 *      `router.push('/nina')` is gone. `tests/nina.chatPhoto.test.ts` is the precedent for
 *      asserting on this file this way.
 *
 * Mocking a `'use server'` module is ordinary `vi.mock` — the directive is a bundler concern, and
 * suites that import `lib/nina/actions.ts` directly (`tests/nina.chatPhotoReattach.test.ts`)
 * already prove these modules load fine under Vitest. Mocking the two collaborators whole also
 * keeps `requireUserId`, `next/cache` and the database client out of this suite entirely.
 */

const spies = vi.hoisted(() => ({
  sendNinaMessage: vi.fn(),
  createNinaChatSession: vi.fn(),
}))

vi.mock('@/lib/nina/actions', () => ({ sendNinaMessage: spies.sendNinaMessage }))

vi.mock('@/lib/nina/sessionActions', () => ({
  createNinaChatSession: spies.createNinaChatSession,
}))

/* Every id is exactly 12 symbols of `[0-9A-Za-z_-]` for the reason
 * `tests/nina.chatPhotoReattach.test.ts` gives: the real validators run `isValidId`, and a
 * 13-character fixture would refuse on shape while an assertion passed for the wrong reason.
 * (Here the mocks stand in front of the validators, so the discipline is for the fixtures' own
 * readability — and so the suite survives a mock becoming a partial.) */
const AVATAR_ID = 'avaAAAAAAAAA'
const LANDED_SESSION_ID = 'sesAAAAAAAAA'
const OTHER_LANDED_ID = 'sesCCCCCCCCCC'
const CREATED_SESSION_ID = 'sesBBBBBBBBBB'
const RUNNER_MESSAGE_ID = 'msgRUNNER001'

const SENT = {
  ok: true,
  userMessageId: RUNNER_MESSAGE_ID,
  sessionId: LANDED_SESSION_ID,
  cursor: 41,
  turnId: null,
}

const CREATED = { ok: true, sessionId: CREATED_SESSION_ID, next: `/nina?s=${CREATED_SESSION_ID}` }

const REFUSED_SEND = { ok: false, userMessageId: null, sessionId: null, cursor: null, turnId: null }

const REFUSED_CREATE = { ok: false, sessionId: null, next: null }

const REFUSED_RESULT = { ok: false, userMessageId: null, sessionId: null, next: null }

type AlbumActions = typeof import('@/lib/nina/albumActions')

let albumActions: AlbumActions

beforeEach(async () => {
  vi.resetModules()
  for (const spy of Object.values(spies)) spy.mockReset()

  spies.sendNinaMessage.mockResolvedValue({ ...SENT })
  spies.createNinaChatSession.mockResolvedValue({ ...CREATED })

  albumActions = await import('@/lib/nina/albumActions')
})

afterEach(() => {
  vi.resetModules()
})

/** The single input `sendNinaMessage` received, asserting there was exactly one call. */
function sentInput(): Record<string, unknown> {
  expect(spies.sendNinaMessage).toHaveBeenCalledTimes(1)
  return spies.sendNinaMessage.mock.calls[0]![0] as Record<string, unknown>
}

describe('target "recent" is the send that shipped (R1)', () => {
  it('keeps `sessionId: null` — same action chain, same resolution, and never a create', async () => {
    const result = await albumActions.attachNinaPhotoToChat({
      kind: 'avatar',
      id: AVATAR_ID,
      body: '  lihat ini  ',
      target: 'recent',
    })

    expect(spies.createNinaChatSession).not.toHaveBeenCalled()
    expect(sentInput()).toEqual({
      body: 'lihat ini',
      attachExisting: { kind: 'avatar', id: AVATAR_ID },
      sessionId: null,
    })
    expect(result).toEqual({
      ok: true,
      userMessageId: RUNNER_MESSAGE_ID,
      sessionId: LANDED_SESSION_ID,
      next: `/nina?s=${LANDED_SESSION_ID}`,
    })
  })

  it('clamps the question with the one shared clamp', async () => {
    await albumActions.attachNinaPhotoToChat({
      kind: 'avatar',
      id: AVATAR_ID,
      body: `a${'b'.repeat(700)}`,
      target: 'recent',
    })

    expect((sentInput().body as string).length).toBe(600)
  })

  it('still sends an empty question — a photo alone is a valid send (R26)', async () => {
    const result = await albumActions.attachNinaPhotoToChat({
      kind: 'image',
      id: 'imgPHOTO0001',
      body: '   ',
      target: 'recent',
    })

    expect(sentInput()).toMatchObject({ body: '', attachExisting: { kind: 'image' } })
    expect(result.ok).toBe(true)
  })

  it('refuses without a destination when the send refuses', async () => {
    spies.sendNinaMessage.mockResolvedValue({ ...REFUSED_SEND })

    const result = await albumActions.attachNinaPhotoToChat({
      kind: 'avatar',
      id: AVATAR_ID,
      body: '',
      target: 'recent',
    })

    expect(result).toEqual(REFUSED_RESULT)
  })
})

describe('target "new" always lands the photo in a conversation with no prior content (R2)', () => {
  it('creates the session FIRST, then names it explicitly on the send', async () => {
    const result = await albumActions.attachNinaPhotoToChat({
      kind: 'avatar',
      id: AVATAR_ID,
      body: '',
      target: 'new',
    })

    expect(spies.createNinaChatSession).toHaveBeenCalledTimes(1)
    expect(spies.createNinaChatSession.mock.invocationCallOrder[0]!).toBeLessThan(
      spies.sendNinaMessage.mock.invocationCallOrder[0]!,
    )
    expect(sentInput()).toEqual({
      body: '',
      attachExisting: { kind: 'avatar', id: AVATAR_ID },
      sessionId: CREATED_SESSION_ID,
    })
    /* The RESULT reports where the send LANDED — `sendNinaMessage`'s own answer, here the mock's
     * `LANDED_SESSION_ID` — never the create's copy; the divergent case is the test below. */
    expect(result).toEqual({
      ok: true,
      userMessageId: RUNNER_MESSAGE_ID,
      sessionId: LANDED_SESSION_ID,
      next: `/nina?s=${LANDED_SESSION_ID}`,
    })
  })

  it('refuses and never sends when the create fails — there is no session to name', async () => {
    spies.createNinaChatSession.mockResolvedValue({ ...REFUSED_CREATE })

    const result = await albumActions.attachNinaPhotoToChat({
      kind: 'avatar',
      id: AVATAR_ID,
      body: 'ada',
      target: 'new',
    })

    expect(result).toEqual(REFUSED_RESULT)
    expect(spies.sendNinaMessage).not.toHaveBeenCalled()
  })

  it('reports the refusal when the send itself refuses — the created empty session stays', async () => {
    spies.sendNinaMessage.mockResolvedValue({ ...REFUSED_SEND })

    const result = await albumActions.attachNinaPhotoToChat({
      kind: 'avatar',
      id: AVATAR_ID,
      body: '',
      target: 'new',
    })

    expect(result).toEqual(REFUSED_RESULT)
    expect(spies.createNinaChatSession).toHaveBeenCalledTimes(1)
  })

  it('points `next` at the session the photo LANDED in, not the one the create returned', async () => {
    /* The two collaborators disagree on purpose: `sendNinaMessage` re-proves ownership and its
     * `sessionId` is the fact about where the row went. If the shipped `next` ever started life
     * from the create's copy instead of the landed id, this is the assertion that catches it. */
    spies.sendNinaMessage.mockResolvedValue({ ...SENT, sessionId: OTHER_LANDED_ID })

    const result = await albumActions.attachNinaPhotoToChat({
      kind: 'avatar',
      id: AVATAR_ID,
      body: '',
      target: 'new',
    })

    expect(result.next).toBe(`/nina?s=${OTHER_LANDED_ID}`)
  })
})

describe('the strip carries the words as accessible names, not as text (structural)', () => {
  const ABOUT = 'components/nina/NinaAboutScreen.tsx'
  const source = readRepoCode(ABOUT)

  it('both aria-labels are the words the controls replaced', () => {
    expect(source).toContain('aria-label="Kirim ke chat"')
    expect(source).toContain('aria-label="Kirim ke chat baru"')
  })

  it('no visible label survived — the quoted literals are gone from the code', () => {
    expect(source).not.toContain("'Kirim ke chat'")
    expect(source).not.toContain('Mengirim')
  })

  it('both targets are wired to the one handler', () => {
    expect(source).toContain("attach('recent')")
    expect(source).toContain("attach('new')")
  })

  it('both buttons share one flight and stay disabled through it (invariant 7)', () => {
    expect(source.match(/disabled=\{sending !== null\}/g)?.length).toBe(2)
    expect(source).toContain("loading={sending === 'recent'}")
    expect(source).toContain("loading={sending === 'new'}")
  })

  it('the send navigates to the conversation that received the photo', () => {
    expect(source).toContain('router.push(result.next)')
    expect(source).not.toContain("router.push('/nina')")
  })
})
