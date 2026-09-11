import { describe, expect, it } from 'vitest'

import { readRepoCode, repoFileExists } from './support/importGraph'

/**
 * **The Media rail, migrated — read as structure, because the suite has no DOM.**
 *
 * The purged `/admin/photos` rail's suite (`tests/admin.chatPhotosRail.test.ts`) retired with its
 * components; the verbs live in the explorer now, and the decisions a later edit could quietly
 * reverse are pinned the same way the old suite pinned theirs: read the REAL source with comments
 * stripped and assert properties of it.
 *
 * R2 is the load-bearing one: the old brush toggle ALWAYS rendered and dimmed on `prompt == null`,
 * which is the exact defect the user named — *"kalo user udah replace satu photo, ... hapus tombol
 * untuk ngeliat promptnya"*. The toggle must live INSIDE the `prompt != null` conditional, and no
 * dim state may exist for prompt.
 */

const PANE = 'components/admin/explorer/MediaPane.tsx'
const CONTROLS = 'components/admin/explorer/MediaControls.tsx'
const ADD = 'components/admin/explorer/MediaAdd.tsx'
const PANE_DISPATCH = 'components/admin/explorer/SelectionPane.tsx'

describe('the media rail exists where the verbs migrated to', () => {
  it('has all three migrated modules', () => {
    for (const file of [PANE, CONTROLS, ADD]) {
      expect(repoFileExists(file), `${file} is missing`).toBe(true)
    }
  })

  it('SelectionPane dispatches on isMediaRow and keys the media pane by photo id', () => {
    const source = readRepoCode(PANE_DISPATCH)
    expect(source).toContain('isMediaRow(photo)')
    expect(source).toMatch(/<MediaPane\s+key=\{photo\.id\}/)
    // The album controls are untouched: the dispatcher, not the album body, absorbed the note.
    expect(source).toMatch(/onRemoved: \(note: string \| null\) => void/)
  })

  it('MediaControls keeps the fragment idiom: Replace and Remove are labelled icons', () => {
    const source = readRepoCode(CONTROLS)
    expect(source).toContain('aria-label="Replace this photo"')
    expect(source).toContain('aria-label="Remove this photo"')
    expect(source).toContain('SwapIcon')
    expect(source).toContain('TrashIcon')
    expect(source).toMatch(/basis-full/)
    expect(source).not.toContain('flex-col')
  })

  it('MediaAdd is the dedupe-on add flow, and its userId comes from a prop', () => {
    const source = readRepoCode(ADD)
    expect(source).toContain('uploadChatPhoto(userId, file, { dedupe: true })')
    expect(source).toContain('addChatPhotoAction')
    expect(source).toContain('userId: string')
    // A user id that reaches a Blob pathname never comes from a client session.
    expect(source).not.toContain('useSession')
  })

  it('both arms mount the unified panel with their own table’s actions', () => {
    const pane = readRepoCode(PANE)
    const dispatcher = readRepoCode(PANE_DISPATCH)
    expect(pane).toContain('<PhotoDescription')
    expect(dispatcher).toContain('<PhotoDescription')
    expect(pane).toContain('describeChatPhotoAction')
    expect(dispatcher).toContain('editNinaAvatarDescriptionAction')
    // The seam is gone and no describe affordance remains in an icon row.
    expect(
      repoFileExists('components/admin/explorer/MediaDescription.tsx'),
      'MediaDescription.tsx survived its own seam',
    ).toBe(false)
    expect(pane).not.toContain('MediaDescription')
    expect(pane).not.toContain('EyeIcon')
  })
})

describe('R2 — the prompt affordance exists only while the sidecar does', () => {
  it('the brush toggle is INSIDE the prompt != null conditional', () => {
    const source = readRepoCode(PANE)
    expect(source).toMatch(/photo\.prompt != null && \(\s*\n\s*<button/)
  })

  it('no dim state exists for prompt — the old defect spelled as an absence', () => {
    const source = readRepoCode(PANE)
    // The old rail dimmed on `prompt == null` while always rendering. That expression must not
    // exist anywhere in the pane.
    expect(source).not.toMatch(/prompt == null/)
  })

  it('the expanded prompt block re-checks the sidecar', () => {
    const source = readRepoCode(PANE)
    expect(source).toMatch(/showPrompt && photo\.prompt != null/)
  })
})

describe('the purge is total', () => {
  it('no ChatPhoto* component remains in components/admin', () => {
    for (const file of [
      'components/admin/ChatPhotoGrid.tsx',
      'components/admin/ChatPhotoDetail.tsx',
      'components/admin/ChatPhotoControls.tsx',
      'components/admin/ChatPhotoAdd.tsx',
      'components/admin/ChatPhotoDescription.tsx',
      'components/admin/ChatPhotoProfilePicture.tsx',
      'components/admin/chatPhotoUpload.ts',
      'components/admin/chatPhotoModel.ts',
      'app/admin/photos/page.tsx',
      'tests/admin.chatPhotosRail.test.ts',
    ]) {
      expect(repoFileExists(file), `${file} survived the purge`).toBe(false)
    }
  })

  it('the media flow never parses a stored pathname', () => {
    // Carried forward from chatPhotoModel.ts's load-bearing rule: the pathname is displayed
    // (nowhere, in the explorer) and never parsed. Comments are stripped by readRepoCode, so
    // this is a statement about CODE.
    for (const file of [PANE, CONTROLS, ADD]) {
      const source = readRepoCode(file)
      expect(source).not.toMatch(/pathname\.(split|slice|match|replace|startsWith|endsWith)/)
    }
  })
})
