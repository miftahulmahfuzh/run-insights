// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { isOverPhotoBudget, NINA_PHOTO_SAFE_COUNT } from '@/lib/admin/photoBudget'

import { PhotoBudgetBanner } from './PhotoBudgetBanner'

afterEach(cleanup)

describe('isOverPhotoBudget', () => {
  it('is quiet at the safe number and fires one past it', () => {
    expect(isOverPhotoBudget(NINA_PHOTO_SAFE_COUNT - 1)).toBe(false)
    expect(isOverPhotoBudget(NINA_PHOTO_SAFE_COUNT)).toBe(false)
    expect(isOverPhotoBudget(NINA_PHOTO_SAFE_COUNT + 1)).toBe(true)
  })
})

describe('PhotoBudgetBanner', () => {
  it('names the count, the limit, how many to remove, and where to remove them', () => {
    render(<PhotoBudgetBanner count={1342} safeCount={1300} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('1342 photos are stored')
    expect(alert.textContent).toContain('safe limit for the free Blob plan is 1300')
    expect(alert.textContent).toContain('Remove at least 42')
    expect(screen.getByRole('link', { name: 'Image collection' }).getAttribute('href')).toBe(
      '/admin/nina',
    )
  })

  it('closes on dismiss, and a fresh mount shows it again', () => {
    const { unmount } = render(<PhotoBudgetBanner count={1342} safeCount={1300} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the storage warning' }))
    expect(screen.queryByRole('alert')).toBeNull()

    // A fresh load of /admin is a fresh mount of the layout: nothing remembers the close.
    unmount()
    render(<PhotoBudgetBanner count={1342} safeCount={1300} />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
