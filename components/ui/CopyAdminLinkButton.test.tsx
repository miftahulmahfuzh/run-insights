// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { adminPhotoLink } = vi.hoisted(() => ({ adminPhotoLink: vi.fn() }))
/*
 * Phase 1 owns the URL grammar and proves all three kinds in `lib/admin/albumDeepLink.test.ts`.
 * What is under test HERE is the button's contract about that function: the arguments it passes,
 * and that a refusal renders no control at all rather than a dead one.
 */
vi.mock('@/lib/admin/albumDeepLink', () => ({ adminPhotoLink }))

import {
  COPY_ADMIN_LINK_DONE,
  COPY_ADMIN_LINK_FAILED,
  COPY_ADMIN_LINK_FIELD,
  COPY_ADMIN_LINK_LABEL,
  CopyAdminLinkButton,
} from './CopyAdminLinkButton'

import type { PhotoPointer } from '@/lib/photos/pointer'

/**
 * The icon-only copy-admin-link control. **Clipboard only, by the runner's own ruling** — a tap
 * writes `navigator.clipboard.writeText` and nothing else, and the one fallback is the link on
 * screen in a selectable field when the clipboard refuses. The tick and the `role="status"` region
 * are the only two things on screen that say a copy happened.
 *
 * The tests pin both rungs, the refusal, the fact that it is icon-only — and, explicitly, that
 * `navigator.share` is NEVER called even on a platform that has it. That last one is a regression
 * test for a decision, not a description of an accident: the first draft of this component opened a
 * share sheet first, and the whole point of the ruling is that it no longer may.
 */

const IMAGE_POINTER: PhotoPointer = { kind: 'image', id: 'Rm2NGabc1234' }
const SHOT_POINTER: PhotoPointer = { kind: 'shot', id: 'Sh0tIdaaaaaa' }
const ORIGIN = 'https://runins.site'
const LINK = 'https://runins.site/admin/nina?view=media&image=Rm2NGabc1234'

const clipboardWrite = vi.fn()

/**
 * A working `navigator.share`, installed for EVERY test in this file.
 *
 * happy-dom ships none of its own, so a "the component never shares" assertion made against a bare
 * environment would be vacuous — it would pass on a component that calls `navigator.share` eagerly,
 * simply because there was nothing there to call. Installing one everywhere means every case below
 * runs on a share-capable platform (an iPhone, which is the device R1 describes) and the clipboard
 * is reached because the component chose it, not because the alternative was missing.
 */
const navigatorShare = vi.fn()

function copyButton() {
  return screen.getByRole('button', {
    name: new RegExp(`^(${COPY_ADMIN_LINK_LABEL}|${COPY_ADMIN_LINK_DONE})$`),
  })
}

async function click() {
  fireEvent.click(copyButton())
  await act(async () => {})
  await act(async () => {})
}

function renderButton(pointer: PhotoPointer = IMAGE_POINTER, origin: string = ORIGIN) {
  return render(<CopyAdminLinkButton pointer={pointer} origin={origin} />)
}

beforeEach(() => {
  // mockReset and not clearAllMocks: a failed test's unconsumed `…Once` queue would otherwise
  // ghost into the next one.
  adminPhotoLink.mockReset()
  clipboardWrite.mockReset()
  navigatorShare.mockReset()
  adminPhotoLink.mockReturnValue(LINK)
  // The happy default. A test that wants the fallback rung overrides it with mockRejectedValue.
  clipboardWrite.mockResolvedValue(undefined)
  navigatorShare.mockResolvedValue(undefined)
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: clipboardWrite },
    configurable: true,
  })
  Object.defineProperty(window.navigator, 'share', {
    value: navigatorShare,
    configurable: true,
  })
})

afterEach(() => {
  delete (window.navigator as { share?: unknown }).share
  delete (window.navigator as { clipboard?: unknown }).clipboard
  vi.useRealTimers()
})

describe('CopyAdminLinkButton — the control itself', () => {
  it('is ICON ONLY: the verb lives in aria-label and title, and the glyph is hidden', () => {
    renderButton()

    const button = copyButton()
    expect(button).toHaveAttribute('aria-label', COPY_ADMIN_LINK_LABEL)
    expect(button).toHaveAttribute('title', COPY_ADMIN_LINK_LABEL)
    // No text node at all — R1 asked for an icon, and the header row has no width for a word.
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('mints the link from the pointer and the threaded origin — kind, id, origin, in that order', () => {
    renderButton()

    expect(adminPhotoLink).toHaveBeenCalledWith('image', 'Rm2NGabc1234', ORIGIN)
  })

  it('an avatar pointer mints through the album arm with the SAME call shape', () => {
    renderButton({ kind: 'avatar', id: 'Av4tarbbbbbb' })

    expect(adminPhotoLink).toHaveBeenCalledWith('avatar', 'Av4tarbbbbbb', ORIGIN)
  })

  it('a REFUSED kind renders nothing at all — never a dead button', () => {
    // `/admin/nina` holds no `run_photos`, so phase 1's minter answers null for 'shot'. A control
    // that copies a URL resolving to nothing is worse than no control.
    adminPhotoLink.mockReturnValue(null)
    const { container } = renderButton(SHOT_POINTER)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('CopyAdminLinkButton — clipboard only', () => {
  it('a tap writes the minted link to the clipboard, and says so twice', async () => {
    renderButton()

    await click()

    expect(clipboardWrite).toHaveBeenCalledTimes(1)
    expect(clipboardWrite).toHaveBeenCalledWith(LINK)
    expect(copyButton()).toHaveAttribute('aria-label', COPY_ADMIN_LINK_DONE)
    expect(screen.getByRole('status')).toHaveTextContent(COPY_ADMIN_LINK_DONE)
  })

  it('NEVER calls navigator.share, even on a platform that has one', async () => {
    /*
     * The regression test for the ruling, stated as a rule rather than observed as a side effect.
     * `beforeEach` installs a working `navigator.share`, so this is the iPhone case — the device
     * R1 describes, and the one where a share-first ladder would have meant the plain copy this
     * button is named after never ran at all. The runner's words: "yes, clipboard-only, no share
     * sheet".
     */
    renderButton()

    await click()

    expect(navigatorShare).not.toHaveBeenCalled()
    expect(clipboardWrite).toHaveBeenCalledWith(LINK)
  })

  it('still copies when the platform has NO share API — the behaviour does not depend on one', async () => {
    // Deleting the own property restores what happy-dom has, which is nothing — a desktop browser
    // without the API. Same path, same single clipboard write, same tick.
    delete (window.navigator as { share?: unknown }).share
    renderButton()

    await click()

    expect(clipboardWrite).toHaveBeenCalledWith(LINK)
    expect(screen.getByRole('status')).toHaveTextContent(COPY_ADMIN_LINK_DONE)
  })

  it('while in flight it disables itself and announces busy — then comes back', async () => {
    let resolve!: () => void
    // The clipboard write is what is held open now: it is the only awaited call in the handler.
    clipboardWrite.mockReturnValue(new Promise<void>((res) => (resolve = res)))
    renderButton()

    fireEvent.click(copyButton())
    await act(async () => {})

    expect(copyButton()).toBeDisabled()
    expect(copyButton()).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      resolve()
    })
    await act(async () => {})

    expect(copyButton()).toBeEnabled()
    expect(copyButton()).toHaveAttribute('aria-busy', 'false')
  })

  it('the tick expires after two seconds so the header reads as a copy button again', async () => {
    vi.useFakeTimers()
    renderButton()

    fireEvent.click(copyButton())
    await act(async () => {})
    await act(async () => {})
    expect(copyButton()).toHaveAttribute('aria-label', COPY_ADMIN_LINK_DONE)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(copyButton()).toHaveAttribute('aria-label', COPY_ADMIN_LINK_LABEL)
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('CopyAdminLinkButton — the one fallback: the link on screen', () => {
  it('a refused clipboard puts the link in a read-only, selectable field', async () => {
    clipboardWrite.mockRejectedValue(new Error('insecure context'))
    renderButton()

    await click()

    expect(screen.getByText(COPY_ADMIN_LINK_FAILED)).toBeInTheDocument()
    const field = screen.getByLabelText(COPY_ADMIN_LINK_FIELD)
    expect(field).toHaveValue(LINK)
    // readOnly, never disabled: a disabled input cannot be selected, which would defeat the point.
    expect(field).toHaveAttribute('readonly')
    expect(field).not.toBeDisabled()
  })

  it('the fallback does NOT expire — it is a link being selected by hand', async () => {
    vi.useFakeTimers()
    clipboardWrite.mockRejectedValue(new Error('insecure context'))
    renderButton()

    fireEvent.click(copyButton())
    await act(async () => {})
    await act(async () => {})

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(screen.getByLabelText(COPY_ADMIN_LINK_FIELD)).toHaveValue(LINK)
  })
})
