// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireUserId, pushEnv, countLivePushSubscriptions, PushSetupCard } = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  pushEnv: vi.fn(),
  countLivePushSubscriptions: vi.fn(),
  // The card is replaced, not rendered: this file pins the WRAPPER's one job — read VAPID on the
  // server, read the database, and hand both down as props. The card's own behaviour (probing,
  // subscribe, the iOS states) is its own file's business.
  PushSetupCard: (props: { vapidPublicKey: string; initiallySubscribed: boolean }) => (
    <div
      data-testid="card"
      data-key={props.vapidPublicKey}
      data-subscribed={String(props.initiallySubscribed)}
    />
  ),
}))

// Every collaborator crosses a boundary — cookies, process env, Postgres — and `lib/env` imports
// `server-only` and parses eagerly, so the mock also keeps the test from loading any of that.
vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId }))
vi.mock('@/lib/env', () => ({ pushEnv }))
vi.mock('@/lib/push/queries', () => ({ countLivePushSubscriptions }))
vi.mock('./PushSetupCard', () => ({ PushSetupCard }))

import { PushSetup } from './PushSetup'

/**
 * The wrapper's whole reason to exist (its own header comment): the VAPID public key may be read
 * only on the server — `NEXT_PUBLIC_` is forbidden outright — so this async component is the
 * bridge. The one behaviour that is easy to get wrong and easy to test: a deployment with NO VAPID
 * keys must still render `/me`, with the plain "deploy problem" sentence — the fallback fires
 * BEFORE the subscription query, not after it.
 */
describe('PushSetup', () => {
  beforeEach(() => {
    for (const mock of [requireUserId, pushEnv, countLivePushSubscriptions]) mock.mockReset()
    requireUserId.mockResolvedValue('user-1')
  })

  it('a deployment with no VAPID keys renders the fallback — and never reaches the database', async () => {
    pushEnv.mockImplementation(() => {
      throw new Error('VAPID_PUBLIC_KEY is unset')
    })

    const { container } = render(await PushSetup())

    expect(
      screen.getByText('Push notifications are not configured on this deployment.'),
    ).toBeInTheDocument()
    expect(container.querySelector('[data-testid="card"]')).not.toBeInTheDocument()
    expect(countLivePushSubscriptions).not.toHaveBeenCalled()
  })

  it('reads VAPID server-side and hands it to the card as a prop — the guard stays absolute', async () => {
    pushEnv.mockReturnValue({ VAPID_PUBLIC_KEY: 'key-from-env' })
    countLivePushSubscriptions.mockResolvedValue(0)

    render(await PushSetup())

    const card = screen.getByTestId('card')
    expect(card).toHaveAttribute('data-key', 'key-from-env')
    expect(requireUserId).toHaveBeenCalledTimes(1)
  })

  it('initiallySubscribed is the DATABASE’s answer — live subscriptions, not the browser’s', async () => {
    pushEnv.mockReturnValue({ VAPID_PUBLIC_KEY: 'key-123' })

    countLivePushSubscriptions.mockResolvedValue(2)
    const first = render(await PushSetup())
    expect(screen.getByTestId('card')).toHaveAttribute('data-subscribed', 'true')
    first.unmount()

    countLivePushSubscriptions.mockResolvedValue(0)
    render(await PushSetup())
    expect(screen.getByTestId('card')).toHaveAttribute('data-subscribed', 'false')
  })
})
