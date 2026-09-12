// @vitest-environment happy-dom
import type * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChartFrame, ChartSkeleton, LegendKey, TableTwin } from './ChartFrame'

/**
 * The chrome all five F08 charts share. The DOM-level contracts under test here are the ones
 * every chart inherits and none may quietly drop:
 *
 *  - the plot area's height is a FIXED inline style that includes the axis band, because a
 *    ResponsiveContainer inside an auto-height parent measures zero and renders nothing;
 *  - `table={null}` renders no disclosure at all — the one sanctioned absence (the splits chart's
 *    twin is the table already printed beneath it) — while any other node lands inside a closed
 *    "Table view" `<details>` that a tap opens;
 *  - legend, caption and the controls row are opt-in slots that vanish whole when ungiven;
 *  - `LegendKey` draws line keys by default and a filled bar only for `variant="bar"`;
 *  - `TableTwin` scopes every header as a column header and right-aligns every column after the
 *    first, so a row's numbers read as a column, not a sentence.
 */

function frame(table: React.ReactNode | null = null) {
  return render(
    <ChartFrame
      title="Pace & heart rate"
      height={186}
      controls={<span>7 to 15 km</span>}
      legend={<span>the legend</span>}
      caption="A plain sentence."
      table={table}
    >
      <div>the plot</div>
    </ChartFrame>,
  )
}

describe('ChartFrame', () => {
  it('renders the eyebrow title and the controls row together in the header', () => {
    frame()

    expect(screen.getByText('Pace & heart rate')).toBeInTheDocument()
    expect(screen.getByText('7 to 15 km')).toBeInTheDocument()
  })

  it('the plot area carries the fixed height as an inline pixel style — not a class, not auto', () => {
    const { container } = frame()

    const plot = container.querySelector('.ri-chart')
    expect(plot).not.toBeNull()
    expect(plot).toHaveStyle({ height: '186px' })
    expect(plot).toHaveTextContent('the plot')
  })

  it('legend and caption render when given', () => {
    frame()

    expect(screen.getByText('the legend')).toBeInTheDocument()
    expect(screen.getByText('A plain sentence.')).toBeInTheDocument()
  })

  it('legend, caption and controls are absent when ungiven — no empty slots left behind', () => {
    render(
      <ChartFrame title="Bare" height={120} table={null}>
        <div>the plot</div>
      </ChartFrame>,
    )

    expect(screen.queryByText('the legend')).not.toBeInTheDocument()
    expect(screen.queryByText('A plain sentence.')).not.toBeInTheDocument()
    expect(screen.getByText('Bare')).toBeInTheDocument()
  })

  it('table={null} renders no disclosure at all — the sanctioned twin-null', () => {
    const { container } = frame(null)

    expect(screen.queryByText('Table view')).not.toBeInTheDocument()
    expect(container.querySelector('details')).toBeNull()
  })

  it('a table twin sits in a closed disclosure until the reader opens it', () => {
    const { container } = frame(
      <table>
        <tbody>
          <tr>
            <td>km 1</td>
          </tr>
        </tbody>
      </table>,
    )

    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(details!.open).toBe(false)
    expect(screen.getByText('Table view')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Table view'))
    expect(details!.open).toBe(true)
    expect(screen.getByText('km 1')).toBeInTheDocument()
  })
})

describe('LegendKey', () => {
  it('defaults to a line key — a stroked line, never a swatch box', () => {
    const { container } = render(<LegendKey className="ri-pace-line">Pace</LegendKey>)

    expect(screen.getByText('Pace')).toBeInTheDocument()
    expect(container.querySelector('svg line')).not.toBeNull()
    expect(container.querySelector('svg rect')).toBeNull()
  })

  it('variant="bar" draws a filled rect instead, because a bar key should look like a bar', () => {
    const { container } = render(
      <LegendKey className="ri-bar-complete" variant="bar">
        Weekly distance
      </LegendKey>,
    )

    expect(screen.getByText('Weekly distance')).toBeInTheDocument()
    expect(container.querySelector('svg rect')).not.toBeNull()
    expect(container.querySelector('svg line')).toBeNull()
  })

  it('the chart colour class reaches the drawn mark, so theming owns the hue', () => {
    const { container } = render(<LegendKey className="ri-hr-line">Heart rate</LegendKey>)

    expect(container.querySelector('svg line')).toHaveClass('ri-hr-line')
  })
})

describe('ChartSkeleton', () => {
  it('holds exactly the frame height it stands in for, so the swap causes zero layout shift', () => {
    const { container } = render(<ChartSkeleton height={168} />)

    const skeleton = container.firstElementChild as HTMLElement
    expect(skeleton).toHaveStyle({ height: '168px' })
    expect(skeleton.className).toContain('bg-paper-2')
  })

  it('is aria-hidden — a downloading chunk is not content', () => {
    const { container } = render(<ChartSkeleton height={186} />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('TableTwin', () => {
  it('renders one scoped column header per declared column, first left and the rest right', () => {
    render(
      <TableTwin columns={['Week', 'Runs', 'Distance']}>
        <tr>
          <td>8 Jun</td>
          <td>3</td>
          <td>10.00 km</td>
        </tr>
      </TableTwin>,
    )

    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((th) => th.textContent)).toEqual(['Week', 'Runs', 'Distance'])
    for (const th of headers) expect(th).toHaveAttribute('scope', 'col')
    expect(headers[0]).not.toHaveClass('text-right')
    expect(headers[1]).toHaveClass('text-right')
    expect(headers[2]).toHaveClass('text-right')
  })

  it('mounts the children in the tbody, after the header row', () => {
    const { container } = render(
      <TableTwin columns={['Week', 'Runs']}>
        <tr>
          <td>8 Jun</td>
          <td>3</td>
        </tr>
      </TableTwin>,
    )

    const rows = container.querySelectorAll('table tr')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveTextContent('8 Jun')
  })
})
