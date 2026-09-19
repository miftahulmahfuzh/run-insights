import { describe, expect, it } from 'vitest'

import {
  auditChatPhotoRows,
  chatPhotoAdoptedIds,
  isOriginalPhotoRow,
  matchesGeneratedChatPhotoScope,
  matchesMediaCollectionScope,
} from '@/scripts/nina-chat-photo-audit.mjs'

/**
 * The pure half of `scripts/nina-chat-photo-audit.mjs`. The script's own I/O (the two SELECTs
 * against production) is prod-only by construction, same argument `tests/nina.dedupeMedia.test.ts`
 * makes for its sibling script — there is nothing to mock, since the script performs no writes at
 * all under any flag.
 */

type ChatPhotoRow = ReturnType<typeof row>

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'row-1',
    userId: 'user-1',
    messageId: 'msg-1',
    kind: 'generated',
    sourceAvatarId: null,
    sourceImageId: null,
    pathname: 'nina/user-1/row-1.jpg',
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

describe('isOriginalPhotoRow', () => {
  it('is true when both provenance columns are null', () => {
    expect(isOriginalPhotoRow(row())).toBe(true)
  })

  it('is false when source_avatar_id is set', () => {
    expect(isOriginalPhotoRow(row({ sourceAvatarId: 'avatar-1' }))).toBe(false)
  })

  it('is false when source_image_id is set', () => {
    expect(isOriginalPhotoRow(row({ sourceImageId: 'row-0' }))).toBe(false)
  })

  it('is false when both are set (an album face re-attached twice)', () => {
    expect(isOriginalPhotoRow(row({ sourceAvatarId: 'avatar-1', sourceImageId: 'row-0' }))).toBe(
      false,
    )
  })
})

describe('chatPhotoAdoptedIds', () => {
  it('extracts the image id from a chat-photo: source_key', () => {
    const ids = chatPhotoAdoptedIds([{ userId: 'user-1', sourceKey: 'chat-photo:row-1' }])
    expect(ids.has('row-1')).toBe(true)
  })

  it('ignores an avatar row whose source_key is not a chat-photo pointer', () => {
    const ids = chatPhotoAdoptedIds([{ userId: 'user-1', sourceKey: 'upload:something' }])
    expect(ids.size).toBe(0)
  })

  it('ignores a null source_key', () => {
    const ids = chatPhotoAdoptedIds([{ userId: 'user-1', sourceKey: null }])
    expect(ids.size).toBe(0)
  })
})

describe('matchesGeneratedChatPhotoScope', () => {
  it('matches an original generated row not yet adopted into the album', () => {
    expect(matchesGeneratedChatPhotoScope(row(), new Set())).toBe(true)
  })

  it('excludes an upload — the kind arm is generated-only, unlike the media scope', () => {
    expect(matchesGeneratedChatPhotoScope(row({ kind: 'upload' }), new Set())).toBe(false)
  })

  it('excludes a reference row', () => {
    expect(matchesGeneratedChatPhotoScope(row({ sourceAvatarId: 'avatar-1' }), new Set())).toBe(
      false,
    )
  })

  it('excludes a row already copied into the album', () => {
    expect(matchesGeneratedChatPhotoScope(row(), new Set(['row-1']))).toBe(false)
  })
})

describe('matchesMediaCollectionScope', () => {
  it('has no kind arm — an original upload counts, unlike the generated-only scope', () => {
    expect(matchesMediaCollectionScope(row({ kind: 'upload' }))).toBe(true)
  })

  it('excludes a reference row the same way isOriginalPhoto() does', () => {
    expect(matchesMediaCollectionScope(row({ sourceImageId: 'row-0' }))).toBe(false)
  })
})

describe('auditChatPhotoRows', () => {
  it('reports zero of everything over an empty set', () => {
    const report = auditChatPhotoRows([])
    expect(report.referenceRows).toEqual([])
    expect(report.orphanRows).toEqual([])
    expect(report.danglingSourceImageRows).toEqual([])
    expect(report.pathnameDuplicateGroups).toEqual([])
  })

  it('finds a reference row via either provenance column', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', sourceAvatarId: 'avatar-1' })]
    const report = auditChatPhotoRows(rows)
    expect(report.referenceRows.map((r: ChatPhotoRow) => r.id)).toEqual(['b'])
  })

  it('finds an orphan (message_id IS NULL)', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', messageId: null })]
    const report = auditChatPhotoRows(rows)
    expect(report.orphanRows.map((r: ChatPhotoRow) => r.id)).toEqual(['b'])
  })

  it('flags a source_image_id pointing at a row absent from the loaded set', () => {
    const rows = [row({ id: 'a', sourceImageId: 'ghost' })]
    const report = auditChatPhotoRows(rows)
    expect(report.danglingSourceImageRows.map((r: ChatPhotoRow) => r.id)).toEqual(['a'])
  })

  it('does not flag a source_image_id that resolves inside the loaded set', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', sourceImageId: 'a' })]
    const report = auditChatPhotoRows(rows)
    expect(report.danglingSourceImageRows).toEqual([])
  })

  it('groups rows sharing a pathname, singleton pathnames excluded', () => {
    const rows = [
      row({ id: 'a', pathname: 'nina/user-1/shared.jpg' }),
      row({ id: 'b', pathname: 'nina/user-1/shared.jpg' }),
      row({ id: 'c', pathname: 'nina/user-1/unique.jpg' }),
    ]
    const report = auditChatPhotoRows(rows)
    expect(report.pathnameDuplicateGroups).toHaveLength(1)
    expect(report.pathnameDuplicateGroups[0].map((r: ChatPhotoRow) => r.id)).toEqual(['a', 'b'])
  })
})
