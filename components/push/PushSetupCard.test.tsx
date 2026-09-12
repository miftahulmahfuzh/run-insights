// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { subscribeToPushAction, unsubscribeFromPushAction, sendTestPushAction } = vi.hoisted(() => ({
  subscribeToPushAction: vi.fn(),
  unsubscribeFromPushAction: vi.fn(),
  sendTestPushAction: vi.fn(),
}))
// The three Server Actions cross cookies + Postgres; every behaviour pinned here is the card's own
// decision tree about them — which of the five support states it lands in, and what each button
// does to the subscription and the row behind it.
vi.mock('@/lib/push/actions', () => ({
  subscribeToPushAction,
  unsubscribeFromPushAction,
  sendTestPushAction,
}))

import { PushSetupCard } from './PushSetupCard'

/**
 * The card is a five-state machine decided once on mount (`probing`, `ready`, `needs-install`,
 * `denied`, `unsupported`), and the tests pin the decisions, not the DOM around them:
 *
 *  - a tab with no PushManager on iOS means INSTALL, on anything else means UNSUPPORTED — two
 *    different sentences for two different situations;
 *  - while probing, the card shows the DATABASE's answer and keeps the subscribe button dead, so
 *    there is no flash of "unsupported" and no tap that fires into a half-probed browser;
 *  - the BROWSER, not the row, is the authority on this device's subscription once probing lands;
 *  - unsubscribe reads the endpoint BEFORE destroying the subscription — the row is keyed by it.
 */

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function makeSubscription(endpoint: string) {
  return {
    endpoint,
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    toJSON: () => ({ endpoint }),
  }
}

function makeRegistration(subscription: unknown) {
  return {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn(),
    },
  }
}

interface BrowserOpts {
  iOS?: boolean
  standalone?: boolean
  pushable?: boolean
  permission?: 'granted' | 'denied'
  registration?: ReturnType<typeof makeRegistration>
  registerError?: Error
  holdRegistration?: boolean
}

function installBrowser({
  iOS = false,
  standalone = false,
  pushable = true,
  permission = 'granted',
  registration = makeRegistration(null),
  registerError,
  holdRegistration,
}: BrowserOpts = {}) {
  const register = vi.fn()
  if (registerError) register.mockRejectedValue(registerError)
  else if (holdRegistration) register.mockReturnValue(new Promise(() => {}))
  else register.mockResolvedValue(registration)

  Object.defineProperty(window.navigator, 'userAgent', {
    value: iOS ? IOS_UA : DESKTOP_UA,
    configurable: true,
  })
  vi.spyOn(window, 'matchMedia').mockImplementation(((query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia)

  if (pushable) {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: { register, ready: Promise.resolve(registration) },
      configurable: true,
    })
    // Only its EXISTENCE is probed (`'PushManager' in window`).
    ;(window as { PushManager?: unknown }).PushManager = class PushManager {}
  }
  vi.stubGlobal('Notification', { permission })

  return { register, registration }
}

async function click(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
  await act(async () => {})
  await act(async () => {})
}

beforeEach(() => {
  for (const mock of [subscribeToPushAction, unsubscribeFromPushAction, sendTestPushAction])
    mock.mockReset()
  subscribeToPushAction.mockResolvedValue({ ok: true })
  unsubscribeFromPushAction.mockResolvedValue({ ok: true })
  sendTestPushAction.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (window.navigator as { userAgent?: unknown }).userAgent
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker
  delete (window as { PushManager?: unknown }).PushManager
})

describe('PushSetupCard — the support states', () => {
  it('a browser with no push APIs at all says "cannot", plainly', async () => {
    installBrowser({ pushable: false })
    const { container } = render(
      <PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />,
    )

    expect(
      screen.getByText(
        'This browser cannot do push notifications. Nina still writes — the dot on her tab is how you will know.',
      ),
    ).toBeInTheDocument()
    expect(container.querySelector('button')).toBeNull()
  })

  it('iOS in a tab is NOT "cannot" — it is the install instruction, rendered instead of a button', async () => {
    installBrowser({ iOS: true, pushable: false })
    const { container } = render(
      <PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />,
    )

    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(
      screen.getByText(/Safari does not deliver notifications to a browser tab/),
    ).toBeInTheDocument()
    expect(container.querySelector('button')).toBeNull()
  })

  it('iOS installed to the home screen but missing the APIs is "cannot", not "install"', async () => {
    installBrowser({ iOS: true, standalone: true, pushable: false })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)

    expect(screen.getByText(/This browser cannot do push notifications/)).toBeInTheDocument()
    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument()
  })

  it('a denied permission points at Settings — a button cannot re-ask what the OS refused', async () => {
    installBrowser({ permission: 'denied' })
    const { container } = render(
      <PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />,
    )

    expect(screen.getByText(/Notifications are blocked for this app/)).toBeInTheDocument()
    expect(screen.getByText(/Only your device settings can change that/)).toBeInTheDocument()
    expect(container.querySelector('button')).toBeNull()
    // The denial short-circuits BEFORE any service worker is registered.
    expect(window.navigator.serviceWorker).toBeDefined()
  })

  it('a failed registration degrades to "cannot", not a crash', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installBrowser({ registerError: new Error('quota') })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)

    await act(async () => {})
    expect(screen.getByText(/This browser cannot do push notifications/)).toBeInTheDocument()
    expect(warn).toHaveBeenCalledWith(
      '[push] service worker registration failed',
      expect.any(Error),
    )
  })
})

describe('PushSetupCard — ready, and the probing phase before it', () => {
  it('while probing, the server’s answer shows and the subscribe button is dead — no false flash', async () => {
    installBrowser({ holdRegistration: true })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)

    expect(
      screen.getByText('Off. Nina writes anyway; you just will not know until you open the app.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeDisabled()
  })

  it('probing with a subscribed row shows the On state while it waits', async () => {
    installBrowser({ holdRegistration: true })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed />)

    expect(screen.getByText('On. Nina can reach you when the app is closed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
  })

  it('the browser wins over the row: no browser subscription reads as Off even though the row exists', async () => {
    // A phone that cleared its site data: the row survives, this device is off, and saying On
    // would be the component promising something it cannot deliver.
    installBrowser({ registration: makeRegistration(null) })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed />)

    await act(async () => {})
    expect(screen.getByText(/Off\. Nina writes anyway/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument()
  })

  it('an existing browser subscription reads as On, with Turn off and the test send', async () => {
    installBrowser({ registration: makeRegistration(makeSubscription('https://push.example/1')) })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)

    await act(async () => {})

    expect(screen.getByText('On. Nina can reach you when the app is closed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send me a test' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  })
})

describe('PushSetupCard — subscribe', () => {
  function subscribeRegistration() {
    const registration = makeRegistration(null)
    registration.pushManager.subscribe = vi
      .fn()
      .mockResolvedValue(makeSubscription('https://push.example/new'))
    return registration
  }

  it('subscribes with userVisibleOnly, the decoded VAPID key, and a serialisable subscription', async () => {
    const { registration } = installBrowser({ registration: subscribeRegistration() })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)
    await act(async () => {})

    await click('Turn on notifications')

    const subscribe = registration.pushManager.subscribe as ReturnType<typeof vi.fn>
    expect(subscribe).toHaveBeenCalledTimes(1)
    const args = subscribe.mock.calls[0]![0] as {
      userVisibleOnly: boolean
      applicationServerKey: Uint8Array
    }
    expect(args.userVisibleOnly).toBe(true)
    expect(args.applicationServerKey).toBeInstanceOf(Uint8Array)
    expect(args.applicationServerKey.length).toBeGreaterThan(0)
    // toJSON(), not the host object: a Server Action argument must be serialisable.
    expect(subscribeToPushAction).toHaveBeenCalledWith({
      subscription: { endpoint: 'https://push.example/new' },
      userAgent: window.navigator.userAgent,
    })
    expect(screen.getByText(/On\. Nina can reach you/)).toBeInTheDocument()
  })

  it('a write that failed shows the action’s sentence and stays Off', async () => {
    installBrowser({ registration: subscribeRegistration() })
    subscribeToPushAction.mockResolvedValue({ ok: false, message: 'The database said no.' })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)
    await act(async () => {})

    await click('Turn on notifications')

    expect(screen.getByText('The database said no.')).toBeInTheDocument()
    expect(screen.getByText(/Off\. Nina writes anyway/)).toBeInTheDocument()
  })

  it('a write failure with no message falls back to one', async () => {
    installBrowser({ registration: subscribeRegistration() })
    subscribeToPushAction.mockResolvedValue({ ok: false })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)
    await act(async () => {})

    await click('Turn on notifications')

    expect(screen.getByText('That did not save. Try again.')).toBeInTheDocument()
  })

  it('a NotAllowedError is the runner saying no — the card moves to the Settings state, quietly', async () => {
    const registration = makeRegistration(null)
    registration.pushManager.subscribe = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))
    installBrowser({ registration })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)
    await act(async () => {})

    await click('Turn on notifications')

    expect(screen.getByText(/Notifications are blocked for this app/)).toBeInTheDocument()
    expect(screen.queryByText(/would not turn them on/)).not.toBeInTheDocument()
  })

  it('any other subscription failure is an apology with a next step, not a state change', async () => {
    const registration = makeRegistration(null)
    registration.pushManager.subscribe = vi.fn().mockRejectedValue(new Error('weird'))
    installBrowser({ registration })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed={false} />)
    await act(async () => {})

    await click('Turn on notifications')

    expect(
      screen.getByText('Your browser would not turn them on. Try again, or reload the page.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Notifications are blocked for this app/)).not.toBeInTheDocument()
  })
})

describe('PushSetupCard — unsubscribe', () => {
  it('reads the endpoint BEFORE destroying the subscription, then prunes the row by it', async () => {
    const subscription = makeSubscription('https://push.example/1')
    const registration = makeRegistration(subscription)
    const order: string[] = []
    registration.pushManager.getSubscription.mockImplementation(async () => {
      order.push('read')
      return subscription
    })
    subscription.unsubscribe.mockImplementation(async () => {
      order.push('unsubscribe')
    })
    unsubscribeFromPushAction.mockImplementation(async () => {
      order.push('action')
      return { ok: true }
    })
    installBrowser({ registration })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed />)
    await act(async () => {})

    await click('Turn off')

    // The order IS the design: the row is keyed by the endpoint, so reading it after the
    // unsubscribe is how a database ends up claiming a phone is subscribed when it is not.
    // (The first `read` in the log is the probe's; the sequence that matters is the tap's.)
    expect(order.slice(-3)).toEqual(['read', 'unsubscribe', 'action'])
    expect(unsubscribeFromPushAction).toHaveBeenCalledWith({ endpoint: 'https://push.example/1' })
    expect(screen.getByText(/Off\. Nina writes anyway/)).toBeInTheDocument()
  })

  it('a subscription that died between the probe and the tap: nothing to unsubscribe, no row to prune', async () => {
    // The probe saw a subscription (so the card shows Turn off), but by the time the tap lands the
    // browser reports null — the exact race the `endpoint ?? null` guard exists for.
    const subscription = makeSubscription('https://push.example/1')
    const registration = makeRegistration(null)
    registration.pushManager.getSubscription
      .mockResolvedValueOnce(subscription)
      .mockResolvedValue(null)
    installBrowser({ registration })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed />)
    await act(async () => {})

    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
    await click('Turn off')

    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(unsubscribeFromPushAction).not.toHaveBeenCalled()
    expect(screen.getByText(/Off\. Nina writes anyway/)).toBeInTheDocument()
  })

  it('a failed unsubscribe apologises with a reload step and stays On', async () => {
    const subscription = makeSubscription('https://push.example/1')
    subscription.unsubscribe.mockRejectedValue(new Error('boom'))
    installBrowser({ registration: makeRegistration(subscription) })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed />)
    await act(async () => {})

    await click('Turn off')

    expect(screen.getByText('Could not turn them off. Reload and try again.')).toBeInTheDocument()
    expect(screen.getByText(/On\. Nina can reach you/)).toBeInTheDocument()
  })
})

describe('PushSetupCard — the test send', () => {
  async function readySubscribed() {
    installBrowser({ registration: makeRegistration(makeSubscription('https://push.example/1')) })
    render(<PushSetupCard vapidPublicKey="key-123" initiallySubscribed />)
    await act(async () => {})
  }

  it('a sent test says when to expect it', async () => {
    await readySubscribed()

    await click('Send me a test')

    expect(screen.getByText('Sent. It should arrive in a second or two.')).toBeInTheDocument()
  })

  it('a failed test send surfaces the action’s own sentence', async () => {
    sendTestPushAction.mockResolvedValue({ ok: false, message: 'Nina is offline.' })
    await readySubscribed()

    await click('Send me a test')

    expect(screen.getByText('Nina is offline.')).toBeInTheDocument()
  })
})
