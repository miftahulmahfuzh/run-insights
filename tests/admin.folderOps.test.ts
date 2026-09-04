import { describe, expect, it } from 'vitest'

import {
  folderDepth,
  folderName,
  folderParent,
  isInFolderTree,
  joinFolderPath,
  NINA_FOLDER_ROOT_LABEL,
} from '@/lib/admin/filetree'
import {
  currentPhotoKeptNote,
  currentPhotoRefusal,
  describeCurrentPhoto,
  planFolderCreate,
  planFolderMove,
  planFolderRename,
} from '@/lib/admin/folderOps'

/**
 * Phase 6's refusals. Every case here is a rule that, if it broke, would break hundreds of rows in
 * one action call — a merge that cannot be undone, a subtree re-rooted inside itself, or her face
 * deleted. The planners are pure, so this suite is the whole test surface of the phase.
 *
 * MAX_DEPTH is passed explicitly rather than read from `NINA_FOLDER_MAX_DEPTH`, so a change to
 * phase 2's bound does not silently change what these cases assert.
 *
 * The `describe('path arithmetic')` block below is a **thin sanity check on the four helpers this
 * phase's planners lean on hardest**, not their test suite — those functions are phase 2's and
 * `tests/admin.filetree.test.ts` proves them case by case, including the casing and
 * Windows-separator behaviour this block does not exercise. It is kept because a planner that
 * assembles a path is only correct if the arithmetic under it is, and reading both in one file is
 * what makes the refusal cases below legible.
 */

const MAX_DEPTH = 4

describe('path arithmetic', () => {
  it('counts depth with the album root at zero', () => {
    expect(folderDepth('')).toBe(0)
    expect(folderDepth('Bali')).toBe(1)
    expect(folderDepth('Trips/Bali/2024')).toBe(3)
  })

  it('splits leaf and parent, and the root has neither', () => {
    expect(folderName('Trips/Bali')).toBe('Bali')
    expect(folderName('Bali')).toBe('Bali')
    /* Phase 2's `folderName` labels the album root rather than returning `''` — the tree pane
     * renders it. Every planner here guards `folder === ''` before it asks for a leaf. */
    expect(folderName('')).toBe(NINA_FOLDER_ROOT_LABEL)
    expect(folderParent('Trips/Bali/2024')).toBe('Trips/Bali')
    expect(folderParent('Bali')).toBe('')
    expect(folderParent('')).toBe('')
  })

  it('joins onto the root without a leading slash', () => {
    expect(joinFolderPath('', 'Bali')).toBe('Bali')
    expect(joinFolderPath('Trips', 'Bali')).toBe('Trips/Bali')
  })

  it('contains by segment, not by prefix — Bali does not contain Bali2024', () => {
    expect(isInFolderTree('Bali', 'Bali')).toBe(true)
    expect(isInFolderTree('Bali/2024', 'Bali')).toBe(true)
    expect(isInFolderTree('Bali2024', 'Bali')).toBe(false)
    expect(isInFolderTree('Trips', 'Bali')).toBe(false)
  })

  it('puts everything inside the album root', () => {
    expect(isInFolderTree('', '')).toBe(true)
    expect(isInFolderTree('Trips/Bali', '')).toBe(true)
  })
})

describe('planFolderCreate', () => {
  const folders = ['', 'Trips', 'Trips/Bali']

  it('creates under a parent', () => {
    expect(
      planFolderCreate({ parent: 'Trips', name: 'Japan', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Trips/Japan' })
  })

  it('creates at the album root', () => {
    expect(planFolderCreate({ parent: '', name: 'Studio', folders, maxDepth: MAX_DEPTH })).toEqual({
      ok: true,
      folder: 'Studio',
    })
  })

  it('refuses a name that sanitises away', () => {
    const plan = planFolderCreate({ parent: '', name: '///', folders, maxDepth: MAX_DEPTH })
    expect(plan.ok).toBe(false)
  })

  it('refuses a folder that already exists', () => {
    const plan = planFolderCreate({ parent: 'Trips', name: 'Bali', folders, maxDepth: MAX_DEPTH })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('Trips/Bali')
  })

  it('refuses one level past the depth bound', () => {
    const deep = 'a/b/c/d'
    const plan = planFolderCreate({ parent: deep, name: 'e', folders: [deep], maxDepth: MAX_DEPTH })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain(String(MAX_DEPTH))
  })
})

describe('planFolderRename', () => {
  const folders = ['Trips', 'Trips/Bali', 'Trips/Bali/2024', 'Archive']

  it('renames the leaf and keeps the parent', () => {
    expect(
      planFolderRename({ folder: 'Trips/Bali', name: 'Indonesia', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Trips/Indonesia' })
  })

  it('is a no-op when the name is unchanged', () => {
    expect(
      planFolderRename({ folder: 'Trips/Bali', name: 'Bali', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Trips/Bali' })
  })

  it('refuses renaming the album root', () => {
    const plan = planFolderRename({ folder: '', name: 'Album', folders, maxDepth: MAX_DEPTH })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('album root')
  })

  it('refuses a rename that would merge two folders', () => {
    const plan = planFolderRename({
      folder: 'Trips',
      name: 'Archive',
      folders,
      maxDepth: MAX_DEPTH,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('merged')
  })

  it('refuses a rename onto a path that only exists as an ancestor of rows', () => {
    const plan = planFolderRename({
      folder: 'Archive',
      name: 'Trips',
      folders: ['Archive', 'Trips/Bali'],
      maxDepth: MAX_DEPTH,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('Trips/Bali')
  })
})

describe('planFolderMove', () => {
  const folders = ['Trips', 'Trips/Bali', 'Trips/Bali/2024', 'Archive']

  it('re-parents and keeps the leaf', () => {
    expect(
      planFolderMove({ folder: 'Trips/Bali', parent: 'Archive', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Archive/Bali' })
  })

  it('moves to the album root', () => {
    expect(
      planFolderMove({ folder: 'Trips/Bali', parent: '', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Bali' })
  })

  it('is a no-op when the parent is unchanged', () => {
    expect(
      planFolderMove({ folder: 'Trips/Bali', parent: 'Trips', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Trips/Bali' })
  })

  it('refuses moving a folder inside itself', () => {
    const plan = planFolderMove({
      folder: 'Trips',
      parent: 'Trips/Bali',
      folders,
      maxDepth: MAX_DEPTH,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('inside itself')
  })

  it('checks the depth bound against the DEEPEST descendant, not the destination', () => {
    // Destination `Archive/Trips` is depth 2, which fits. Its deepest descendant afterwards is
    // `Archive/Trips/Bali/2024` at depth 4 — and with maxDepth 3 that is the case a
    // destination-only check would wave through.
    const plan = planFolderMove({
      folder: 'Trips',
      parent: 'Archive',
      folders,
      maxDepth: 3,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('4 folders deep')
  })

  it('allows the same move when the bound is one deeper', () => {
    expect(planFolderMove({ folder: 'Trips', parent: 'Archive', folders, maxDepth: 4 })).toEqual({
      ok: true,
      folder: 'Archive/Trips',
    })
  })
})

describe('the current photo', () => {
  const current = { id: 'aB3_dEf-hI9k', folder: 'Trips/Bali', filename: 'nina-01.jpg' }

  it('names the photo and its folder', () => {
    expect(describeCurrentPhoto(current)).toBe('nina-01.jpg (Trips/Bali)')
    expect(describeCurrentPhoto({ ...current, filename: null })).toBe('aB3_dEf-hI9k (Trips/Bali)')
    expect(describeCurrentPhoto({ ...current, folder: '' })).toBe('nina-01.jpg (the album root)')
  })

  it('does not refuse when her photo is out of scope', () => {
    expect(currentPhotoRefusal(null, false)).toBeNull()
    expect(currentPhotoRefusal(null, true)).toBeNull()
  })

  it('refuses by default, and names the photo and the fix', () => {
    const refusal = currentPhotoRefusal(current, false)
    expect(refusal).not.toBeNull()
    expect(refusal).toContain('nina-01.jpg')
    expect(refusal).toContain('Make another photo current')
  })

  it('proceeds only when the operator answered the refusal', () => {
    expect(currentPhotoRefusal(current, true)).toBeNull()
    expect(currentPhotoKeptNote(current)).toContain('stayed behind')
  })
})
