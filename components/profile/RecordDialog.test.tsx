// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RECORD_ART } from '@/lib/records/record-art'

import type { RecordRowView } from './RecordsTable'

import { RecordDialog } from './RecordDialog'

/**
 * The record panel's body, driven through its props — what `tests/badges.render.test.ts` can
 * only see as markup: that the four lines are ALWAYS all there (the round-2 finding — a panel
 * whose shape depends on the data reads as a defect report), that the two `previousValue`
 * branches are distinguishable not just by words but by the quieter tone the null branch takes,
 * that the copy is the catalog's own (`RECORD_LABELS`, `formatRecordValue` — never "your 10k
 * PB"), and that `PanelArt.dimmed` is never set here: `records.run_id` is `ON DELETE CASCADE`,
 * so a record panel is always held by a run that exists and never dims. No navigation mock is
 * needed — this component takes its row as a prop; the URL that names it lives one level up in
 * `RecordsTable`.
 */

vi.mock('next/image', () => ({
  // `className` forwarded: asserting that the dim treatment is ABSENT needs the class to arrive.
  default: ({ src, className }: { src: string; className?: string }) => (
    <img src={src} className={className} data-testid="panel-art" />
  ),
}))

function row(over: Partial<RecordRowView>): RecordRowView {
  return {
    key: 'longest_distance',
    runId: 'run_a',
    value: 10670,
    achievedOn: '2026-08-20',
    previousValue: null,
    ...over,
  }
}

function renderDialog(rowProp: RecordRowView | null) {
  const onClose = vi.fn()
  render(<RecordDialog row={rowProp} onClose={onClose} />)
  return { onClose }
}

function openDialog() {
  return screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement
}

describe('RecordDialog', () => {
  it('no row: the dialog exists, shut, with nothing to read', () => {
    renderDialog(null)

    expect(openDialog().open).toBe(false)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('the four lines are always there: eyebrow, the catalog’s own label, the value, the date', () => {
    renderDialog(row({ key: 'fastest_pace_10k', value: 312, runId: 'run_a' }))

    expect(openDialog().open).toBe(true)
    expect(screen.getByText('Personal record')).toBeInTheDocument()
    // The label carries the qualifier — a panel that reworded it would be R-42's second
    // source of truth for the 10 km floor.
    expect(screen.getByRole('heading', { name: 'Fastest pace, 10 km+' })).toBeInTheDocument()
    expect(screen.getByText('5\'12"/km')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Thu, 20 Aug 2026' })).toHaveAttribute(
      'href',
      '/r/run_a',
    )
  })

  it('a displaced value says "Beat … to get here." in the louder tone', () => {
    renderDialog(row({ previousValue: 10100 }))

    expect(screen.getByText('Beat 10.10 km to get here.')).toBeInTheDocument()
    expect(screen.getByText('Beat 10.10 km to get here.')).toHaveClass('text-ink-2')
  })

  it('no earlier value: the line still prints, in the quieter tone — null is not "first"', () => {
    renderDialog(row({ previousValue: null }))

    // The slot is uniform; only its weight changes. "Recorded", not "first": a key whose
    // holding run was deleted demonstrably had a predecessor, and the panel must not lie.
    expect(screen.getByText('No earlier value recorded.')).toBeInTheDocument()
    expect(screen.getByText('No earlier value recorded.')).toHaveClass('text-ink-3')
    expect(screen.queryByText(/Beat /)).not.toBeInTheDocument()
  })

  it('the value prints at the panel size a row cannot give it, via the one formatter (R-23)', () => {
    renderDialog(row({ key: 'earliest_start', value: 25620, runId: 'run_b' }))

    // 25620 seconds past midnight — the one key stored as something other than what it prints.
    expect(screen.getByText('07:07')).toBeInTheDocument()
    expect(screen.queryByText('7:07:00')).not.toBeInTheDocument()
  })

  it('the band art is the record deck’s own derivative, and NEVER dims', () => {
    renderDialog(row({ key: 'longest_distance' }))

    const img = screen.getByTestId('panel-art')
    expect(img).toHaveAttribute('src', RECORD_ART.longest_distance.src)
    expect(img).not.toHaveClass('opacity-50')
    expect(img).not.toHaveClass('grayscale')
  })

  it('Close reports to the caller', () => {
    const { onClose } = renderDialog(row({}))

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
