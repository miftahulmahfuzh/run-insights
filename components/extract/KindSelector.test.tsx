// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SCREEN_KINDS, SCREEN_KIND_LABEL } from '@/lib/extract/constants'

import { KindSelector } from './KindSelector'

/**
 * The rendered half of `tests/extract.kindSelector.test.ts`, which proves the control's
 * properties by reading its source. What a text scan cannot see is what a runner actually taps:
 * three live radios in a named group, exactly one checked, every tap reported — and F16's
 * regression made visible rather than inferred, a tile never rendered disabled merely because a
 * kind is spoken for. The swap rule that keeps kinds distinct lives in `lib/extract/reassignKind.ts`
 * and is proved exhaustively in `tests/extract.reassignKind.test.ts`; this file only proves the
 * control reports taps and reflects state, which is all it is.
 */

const GROUP = 'Which screen is this?'

function renderSelector(props: Partial<React.ComponentProps<typeof KindSelector>> = {}) {
  const onChange = vi.fn()
  render(<KindSelector value="summary" onChange={onChange} {...props} />)
  return { onChange }
}

describe('KindSelector', () => {
  it('renders one named radiogroup with a radio per screen kind, labelled from the shared constants', () => {
    renderSelector()

    const group = screen.getByRole('radiogroup', { name: GROUP })
    expect(within(group).getAllByRole('radio')).toHaveLength(SCREEN_KINDS.length)
    // Labels come from SCREEN_KIND_LABEL — the same source as the prompt and the review strip.
    for (const kind of SCREEN_KINDS) {
      expect(
        within(group).getByRole('radio', { name: SCREEN_KIND_LABEL[kind] }),
      ).toBeInTheDocument()
    }
  })

  it('marks exactly the current value aria-checked', () => {
    renderSelector()

    expect(screen.getByRole('radio', { name: 'Summary' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Splits' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Heart rate' })).not.toBeChecked()
  })

  it('reports the tapped kind through onChange', () => {
    const { onChange } = renderSelector()

    fireEvent.click(screen.getByRole('radio', { name: 'Heart rate' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('heartrate')
  })

  it('reports a tap on the already-held kind too — the no-op decision belongs to reassignKind, not here', () => {
    const { onChange } = renderSelector({ value: 'splits' })

    fireEvent.click(screen.getByRole('radio', { name: 'Splits' }))

    expect(onChange).toHaveBeenCalledWith('splits')
  })

  it('keeps every unselected radio enabled while nothing else is held — the F16 dimming must not creep back into the DOM', () => {
    renderSelector({ value: 'summary' })

    // The historical defect rendered kinds other tiles held as `disabled` at 35% opacity. This
    // control cannot know its neighbours, so its own DOM is the invariant: nothing disabled here.
    expect(screen.getByRole('radio', { name: 'Splits' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'Heart rate' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'Summary' })).toBeEnabled()
  })

  it('honours the submitting guard by disabling all three', () => {
    renderSelector({ disabled: true })

    for (const label of ['Summary', 'Splits', 'Heart rate']) {
      expect(screen.getByRole('radio', { name: label })).toBeDisabled()
    }
  })
})
