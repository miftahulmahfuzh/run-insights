import { describe, expect, it } from 'vitest'

import { readRepoCode, repoFileExists } from './support/importGraph'

/**
 * **The `/admin/photos` rail, reshaped — read as structure, because the suite has no DOM.**
 *
 * R1-R3 of 2026-09-10's design (`docs/plans/2026-09-10-admin-photos-icon-compact-profpic-design.md`),
 * in the operator's words: every button on the page becomes an icon without text; clicking one
 * photo opens a MORE COMPACT rail (no filename under the timestamp, no metadata list, and the two
 * prose blocks collapsed behind icon toggles); and above Replace / Remove, one more icon that
 * expands the album's framing panel, so a chat photograph can become her profile picture.
 *
 * `vitest.config.ts` runs `environment: 'node'` — no jsdom to render into — so these assertions
 * read the REAL source with comments stripped (`readRepoCode`, for the reason stated at its
 * definition) and pin the decisions a later edit could quietly reverse: a visible text label
 * returning, the pathname line coming back, an unlabelled icon button, the framing panel moved
 * below the destructive row.
 */

const ADD = 'components/admin/ChatPhotoAdd.tsx'
const CONTROLS = 'components/admin/ChatPhotoControls.tsx'
const DESCRIPTION = 'components/admin/ChatPhotoDescription.tsx'
const GRID = 'components/admin/ChatPhotoGrid.tsx'
const DETAIL = 'components/admin/ChatPhotoDetail.tsx'
const PROFILE = 'components/admin/ChatPhotoProfilePicture.tsx'
const ICONS = 'components/admin/photoIcons.tsx'

describe('R1 — every button on the page is an icon without text', () => {
  it('has a glyph module in the nav-icons idiom: stroke, currentColor, aria-hidden', () => {
    expect(repoFileExists(ICONS)).toBe(true)
    const source = readRepoCode(ICONS)
    expect(source).toContain('stroke="currentColor"')
    // The accessible name belongs to the control's aria-label, never to the picture — the same
    // rule AdminNavLinks states for its own seven glyphs.
    expect(source.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(8)
  })

  it('ChatPhotoAdd: plus glyph, aria-labelled, and the "Adding 1/3…" counter text is gone', () => {
    const source = readRepoCode(ADD)
    expect(source).toContain('aria-label="Add a photo"')
    expect(source).toContain('PlusIcon')
    expect(source).not.toContain('Add photo')
    expect(source).not.toContain('Adding ')
  })

  it('ChatPhotoControls: Replace and Remove are labelled icons, not labelled text', () => {
    const source = readRepoCode(CONTROLS)
    expect(source).toContain('aria-label="Replace this photo"')
    expect(source).toContain('aria-label="Remove this photo"')
    expect(source).toContain('SwapIcon')
    expect(source).toContain('TrashIcon')
    // The words survive as accessible names and titles, never as children of the <button>.
    expect(source).not.toMatch(/>\s*Replace\s*</)
    expect(source).not.toMatch(/>\s*Remove\s*</)
  })

  it('ChatPhotoDescription: the Save/Clear button is a labelled check glyph', () => {
    const source = readRepoCode(DESCRIPTION)
    expect(source).toContain('CheckIcon')
    expect(source).not.toMatch(/>\s*(Save|Clear)\s*</)
    expect(source).toMatch(/aria-label=\{/)
  })

  it('the pager keeps its rel links and loses its words', () => {
    const source = readRepoCode(GRID)
    expect(source).toContain('aria-label="Newer"')
    expect(source).toContain('aria-label="Older"')
    expect(source).toContain('rel="prev"')
    expect(source).toContain('rel="next"')
    // The word survives only inside the accessible name — never as a child of the link.
    expect(source).not.toMatch(/>\s*(Newer|Older)\s*</)
    expect(source).not.toContain('&lsaquo;')
  })
})

describe('R2 — the detail rail is compact', () => {
  it('the long file name no longer renders under the timestamp', () => {
    const source = readRepoCode(DETAIL)
    // 2a, verbatim: "hide nama file yang panjang (dibawah timestamp)".
    expect(source).not.toContain('{photo.pathname}')
    expect(source).not.toContain('<dl')
  })

  it('"what she can see in it" is one eye toggle, dimmed while undescribed', () => {
    const source = readRepoCode(DETAIL)
    expect(source).toContain('EyeIcon')
    expect(source).toMatch(/aria-expanded=\{/)
    expect(source).toMatch(/description == null/)
  })

  it('"what she was asked to draw" is one brush toggle, dimmed while there is no sidecar', () => {
    const source = readRepoCode(DETAIL)
    expect(source).toContain('BrushIcon')
    expect(source).toMatch(/prompt == null/)
  })

  it('the rail remounts per photo, so every expansion state resets with the selection', () => {
    const grid = readRepoCode(GRID)
    expect(grid).toMatch(/<ChatPhotoDetail\s+key=\{selected\.id\}/)
  })
})

describe('R4 — all five icons share ONE row', () => {
  it('the rail renders the five controls as one contiguous row: eye, brush, person, replace, trash', () => {
    const detail = readRepoCode(DETAIL)
    // The JSX MOUNTS in row order, and the row is one flex container: eye and brush, the
    // hairline divider, the person toggle, then the Replace/Remove pair mounted inline.
    const row = detail.slice(
      detail.indexOf('<EyeIcon'),
      detail.indexOf('</div>', detail.indexOf('<ChatPhotoControls')),
    )
    expect(row).toContain('<EyeIcon')
    expect(row).toContain('<BrushIcon')
    expect(row).toContain('<PersonFrameIcon')
    expect(row).toContain('<ChatPhotoControls')
    // Row order is the reading order: see-what-it-is first, act-on-it after, destructive last.
    expect(row.indexOf('<BrushIcon')).toBeGreaterThan(row.indexOf('<EyeIcon'))
    expect(row.indexOf('<PersonFrameIcon')).toBeGreaterThan(row.indexOf('<BrushIcon'))
    expect(row.indexOf('<ChatPhotoControls')).toBeGreaterThan(row.indexOf('<PersonFrameIcon'))
    // One hairline between the two view toggles and the three action controls.
    expect(row).toContain('bg-rule')
  })

  it('Replace and Remove join the row as siblings, not as their own stacked column', () => {
    const controls = readRepoCode(CONTROLS)
    expect(controls).not.toContain('flex-col')
    // Their inline messages wrap BELOW the row (basis-full in the parent's flex-wrap), which is
    // how text can follow two buttons out of one fragment.
    expect(controls).toMatch(/basis-full/)
  })

  it('the framing panel is panel-only — its toggle lives in the rail row now', () => {
    const source = readRepoCode(PROFILE)
    expect(source).not.toContain('PersonFrameIcon')
    expect(source).not.toMatch(/aria-expanded/)
  })
})

describe('R3 — set as her profile picture, from the chat rail', () => {
  it('the framing panel exists and drives the adoption action', () => {
    expect(repoFileExists(PROFILE)).toBe(true)
    const source = readRepoCode(PROFILE)
    expect(source).toContain('CropStudio')
    expect(source).toContain('setChatPhotoAsAvatarAction')
    // The album's framing half, not a re-design: same draft/reset verbs, same sanity circles.
    expect(source).toContain('Reset framing')
    expect(source).toContain('Set as her profile picture')
    expect(source).toContain('CircleFrame')
  })

  it('the panel disables itself once she is wearing the photo', () => {
    const source = readRepoCode(PROFILE)
    expect(source).toMatch(/wearing/)
  })
})
