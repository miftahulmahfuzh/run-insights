// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }))
// NinaSidebarTrigger reads the panel parameter through the router; outside a provider it renders
// nothing, which is itself one of the behaviours pinned below.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => '/nina',
}))

// The panel's own mutations and searches are transitive imports of ./NinaSidebar, and their
// modules pull the auth boundary (next-auth → next/server) that no component test may cross.
// ChatChrome exercises none of them — the same severance every other nina test applies.
vi.mock('@/lib/nina/sessionActions', () => ({
  createNinaChatSession: vi.fn(),
  removeNinaChatSession: vi.fn(),
  renameNinaChatSession: vi.fn(),
  setNinaChatSessionPinned: vi.fn(),
}))
vi.mock('@/lib/nina/searchActions', () => ({ searchNinaChats: vi.fn() }))

// Real NinaSidebarProvider + Trigger (the `>` pair), real TabBar (the `inert` half is what the
// hidden prop means), real chrome functions and the REAL provider state machine. A minimal
// ResizeObserver is installed because the composer measurement rides one; happy-dom's own, where
// present, never fires for this test and this one fires exactly when told to.
class StubResizeObserver {
  static instances: StubResizeObserver[] = []
  callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
    StubResizeObserver.instances.push(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', StubResizeObserver)

import { ChatChrome } from './ChatChrome'
import { NinaSidebarProvider } from './NinaSidebar'
import { NinaBarProvider } from './NinaBarProvider'
import { controlBottomCss } from '@/lib/nina/chrome'
import { NINA_BAR_VISIBLE_VAR } from '@/lib/nina/chatview'
import { TAB_BAR_OUTER_HEIGHT_PX } from '@/components/ui/TabBar'

function setUp() {
  // AppShell's own nesting: the sidebar provider and the bar provider both wrap the chrome, so
  // the toggle has a state machine to talk to and the trigger has its panel context.
  const utils = render(
    <NinaSidebarProvider>
      <NinaBarProvider>
        <ChatChrome />
      </NinaBarProvider>
    </NinaSidebarProvider>,
  )
  return utils
}

function bar() {
  return document.getElementById('main-tab-bar') as HTMLElement
}

function toggleButton() {
  return screen.getByRole('button', { name: /the main navigation/ })
}

function lane() {
  return document.querySelector('div.pointer-events-none')
}

function rootVar() {
  return document.documentElement.style.getPropertyValue(NINA_BAR_VISIBLE_VAR)
}

beforeEach(() => {
  StubResizeObserver.instances = []
  const composer = document.createElement('div')
  composer.id = 'nina-composer'
  const textarea = document.createElement('textarea')
  const send = document.createElement('button')
  composer.append(textarea, send)
  document.body.appendChild(composer)
})

afterEach(() => {
  document.getElementById('nina-composer')?.remove()
  document.documentElement.style.removeProperty(NINA_BAR_VISIBLE_VAR)
  document.querySelectorAll('[role="dialog"]').forEach((el) => el.remove())
  vi.useRealTimers()
})

describe('ChatChrome', () => {
  it('the bar rests hidden: inert, no var, control reading up', () => {
    setUp()
    expect(bar().hasAttribute('inert')).toBe(true)
    expect(rootVar()).toBe('')
    expect(toggleButton().getAttribute('aria-expanded')).toBe('false')
    expect(toggleButton().getAttribute('aria-label')).toBe('Show the main navigation')
    // The up-chevron path — the glyph is the state, flipped by the pure function.
    expect(toggleButton().querySelector('path')?.getAttribute('d')).toBe('M6 14l6-6 6 6')
  })

  it('toggle shows the bar: the var publishes, inert drops, glyph and name flip', () => {
    setUp()
    fireEvent.click(toggleButton())

    expect(rootVar()).toBe('1')
    expect(bar().hasAttribute('inert')).toBe(false)
    expect(toggleButton().getAttribute('aria-expanded')).toBe('true')
    expect(toggleButton().getAttribute('aria-label')).toBe('Hide the main navigation')
    expect(toggleButton().querySelector('path')?.getAttribute('d')).toBe('M6 10l6 6 6-6')
  })

  it('hiding removes the var again — hide and navigate-away leave nothing behind', () => {
    setUp()
    fireEvent.click(toggleButton())
    expect(rootVar()).toBe('1')
    fireEvent.click(toggleButton())
    expect(rootVar()).toBe('')
    expect(bar().hasAttribute('inert')).toBe(true)
  })

  it('the lane sits where controlBottomCss says, composing the measured composer and the clearance', () => {
    setUp()
    expect(lane()).not.toBeNull()
    // happy-dom lays nothing out, so the composer measures 0 — the unmeasured arm of the pure
    // function, computed by the real one rather than retyped here.
    expect((lane() as HTMLElement).style.bottom).toBe(
      controlBottomCss({
        barState: 'hidden',
        barClearancePx: TAB_BAR_OUTER_HEIGHT_PX,
        composerHeightPx: 0,
      }),
    )
    expect((lane() as HTMLElement).className).toContain('z-40')
  })

  it('R1’s five seconds pull the bar back down; the cleanup means a late toggle restarts the clock', () => {
    vi.useFakeTimers()
    setUp()
    fireEvent.click(toggleButton())
    expect(rootVar()).toBe('1')

    act(() => {
      vi.advanceTimersByTime(4_900)
    })
    expect(rootVar()).toBe('1')

    // Off and on at 4.9s: the old timer died with the shown state, the clock restarts.
    fireEvent.click(toggleButton())
    fireEvent.click(toggleButton())
    act(() => {
      vi.advanceTimersByTime(4_900)
    })
    expect(rootVar()).toBe('1')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(rootVar()).toBe('')
  })

  it('no timer at all while the bar is hidden', () => {
    vi.useFakeTimers()
    setUp()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(rootVar()).toBe('')
  })

  it('focus in the composer hides the bar and retracts the control — a keyboard is up', () => {
    setUp()
    fireEvent.click(toggleButton())
    expect(lane()).not.toBeNull()

    // Real focus, not a synthetic event: the sync reads `document.activeElement`, which only a
    // real `.focus()` moves (happy-dom fires `focusin`, bubbling to the document listener). The
    // handler's setState rides a NATIVE listener, so act must carry the update it triggers.
    act(() => {
      ;(document.querySelector('#nina-composer textarea') as HTMLElement).focus()
    })

    expect(lane()).toBeNull()
    expect(rootVar()).toBe('')
    expect(bar().hasAttribute('inert')).toBe(true)
  })

  it('moving focus WITHIN the composer — textarea to Send — never blinks the retraction', async () => {
    setUp()
    const textarea = document.querySelector('#nina-composer textarea') as HTMLElement
    const send = document.querySelector('#nina-composer button') as HTMLElement
    act(() => {
      textarea.focus()
    })
    expect(lane()).toBeNull()

    // `focusout` defers its read by one task; `focusin` for the Send lands first.
    act(() => {
      textarea.blur()
      send.focus()
    })
    expect(lane()).toBeNull()

    // The deferred sync runs, reads the Send, and stays engaged. Real timers: one task of wait.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
    })
    expect(lane()).toBeNull()
  })

  it('focus leaving the composer returns the control, and the bar stays hidden until toggled', async () => {
    setUp()
    fireEvent.click(toggleButton())
    const textarea = document.querySelector('#nina-composer textarea') as HTMLElement
    act(() => {
      textarea.focus()
    })
    expect(lane()).toBeNull()

    act(() => {
      textarea.blur()
    })
    // The focusout deferral is one real task; the lane returns when it reads `<body>`.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
    })
    expect(lane()).not.toBeNull()
    // Released is not shown: the machine never re-reveals on its own.
    expect(rootVar()).toBe('')
  })

  it('a text field in the panel’s dialog takes the same rule — the composer is not the only keyboard', () => {
    setUp()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const field = document.createElement('input')
    dialog.appendChild(field)
    document.body.appendChild(dialog)

    fireEvent.click(toggleButton())
    expect(lane()).not.toBeNull()

    act(() => {
      field.focus()
    })
    expect(lane()).toBeNull()
    expect(rootVar()).toBe('')
  })

  it('a focus outside the composer and any dialog — even the composer’s own Send button is INSIDE — changes nothing only when it is on neither surface', () => {
    setUp()
    fireEvent.click(toggleButton())
    expect(lane()).not.toBeNull()
    expect(rootVar()).toBe('1')

    // The composer arm is CONTAINMENT, not text-type: focus on the Send inside it is engaged
    // (that is the textarea→Send send-press move, which must not blink). A tap target on NEITHER
    // surface — here, the bar itself — is the case that changes nothing.
    act(() => {
      bar().focus()
    })
    expect(lane()).not.toBeNull()
    expect(rootVar()).toBe('1')
  })

  it('outside a NinaBarProvider nothing crashes and nothing can reveal the bar', () => {
    render(<ChatChrome />)
    expect(rootVar()).toBe('')
    expect(() => fireEvent.click(toggleButton())).not.toThrow()
    expect(rootVar()).toBe('')
  })

  it('the sidebar trigger renders inside its provider (the pair, centred as one group)', () => {
    setUp()
    // Outside the provider the trigger renders null (pinned by NinaSidebar's own contract); inside
    // it, the lane carries both controls and the group is centred.
    expect(lane()?.querySelectorAll('button').length).toBeGreaterThanOrEqual(2)
    expect((lane() as HTMLElement).className).toContain('justify-center')
  })
})
