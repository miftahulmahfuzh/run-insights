import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectReleaseCandidates,
  isInside,
  parseRepairArgs,
  planRepair,
  resolveBackupPath,
  summarizePlan,
} from '@/scripts/nina-profpic-pointer-repair.mjs'

/**
 * The pure half of `scripts/nina-profpic-pointer-repair.mjs`. The I/O half writes production and is
 * exercised by the phase's own dry-run → apply → dry-run sequence, not here — the same line
 * `tests/nina.dedupeMedia.test.ts` draws for its sibling script.
 */

const U = 'user-1'
const store = (p: string) => `https://abc.public.blob.vercel-storage.com/${p}`

function media(id: string, file: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: U,
    blobUrl: store(`nina/${U}/${file}`),
    pathname: `nina/${U}/${file}`,
    width: 576,
    height: 1024,
    bytes: 1000,
    contentHash: `hash-${file}`,
    description: `prose about ${file}` as string | null,
    perceptualHash: `ph-${file}`,
    perceptualSig: `ps-${file}`,
    sourceImageId: null as string | null,
    sourceAvatarId: null as string | null,
    ...overrides,
  }
}

function album(id: string, file: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: U,
    sourceKey: null as string | null,
    sourceImageId: null as string | null,
    isCurrent: false,
    blobUrl: store(`nina/${U}/${file}`),
    pathname: `nina/${U}/${file}`,
    width: 576,
    height: 1024,
    bytes: 900,
    thumbUrl: null as string | null,
    thumbPathname: null as string | null,
    cropScale: '1.204' as string | null,
    cropX: 10 as number | null,
    cropY: 20 as number | null,
    contentHash: 'legacy-hash' as string | null,
    description: 'album prose' as string | null,
    ...overrides,
  }
}

describe('planRepair — legacy copies', () => {
  it('relinks a chat-photo legacy copy whose original is alive, and drops its own object', () => {
    const m = media('jWWu8vkl09fT', 'selfie-v2.jpg')
    const a = album('Daofejusg4Xa', 'avatar-v1.jpg', {
      sourceKey: 'chat-photo:jWWu8vkl09fT',
      isCurrent: true,
    })
    const plan = planRepair({ avatars: [a], images: [m] })
    expect(plan.avatarOps).toHaveLength(1)
    const op = plan.avatarOps[0]
    expect(op?.op).toBe('relink-legacy')
    expect(op?.mediaId).toBe('jWWu8vkl09fT')
    expect(op?.isCurrent).toBe(true)
    expect(op?.to.pathname).toBe(m.pathname)
    expect(op?.to.blobUrl).toBe(m.blobUrl)
    expect(op?.dimsChanged).toBe(false)
    expect(op?.drops).toEqual([{ userId: U, pathname: a.pathname, blobUrl: a.blobUrl }])
  })

  it('marks the crop for reset only when the dimensions differ', () => {
    const m = media('m1', 'selfie.jpg', { width: 768, height: 1024 })
    const a = album('a1', 'avatar.jpg', { sourceKey: 'chat-photo:m1' })
    const [op] = planRepair({ avatars: [a], images: [m] }).avatarOps
    expect(op?.dimsChanged).toBe(true)
    expect(op?.hadCrop).toBe(true)
  })

  it('drops the thumbnail too', () => {
    const m = media('m1', 'selfie.jpg')
    const a = album('a1', 'avatar.jpg', {
      sourceKey: 'chat-photo:m1',
      thumbPathname: `nina/${U}/thumb-a1.webp`,
      thumbUrl: store(`nina/${U}/thumb-a1.webp`),
    })
    const [op] = planRepair({ avatars: [a], images: [m] }).avatarOps
    expect(op?.drops.map((d: { pathname: string }) => d.pathname)).toEqual([
      a.pathname,
      `nina/${U}/thumb-a1.webp`,
    ])
  })

  it('skips a legacy copy whose original is gone, or is itself a reference', () => {
    const ref = media('m2', 'chat-ref.jpg', { sourceImageId: 'm9' })
    const gone = album('a1', 'avatar-1.jpg', { sourceKey: 'chat-photo:missing' })
    const viaRef = album('a2', 'avatar-2.jpg', { sourceKey: 'chat-photo:m2' })
    const plan = planRepair({ avatars: [gone, viaRef], images: [ref] })
    expect(plan.avatarOps).toEqual([])
    // m2's own dangling provenance (m9) is skipped by the reference pass too.
    expect(plan.skipped.map((s: { table: string; id: string }) => [s.table, s.id])).toEqual([
      ['nina_avatars', 'a1'],
      ['nina_avatars', 'a2'],
      ['nina_message_images', 'm2'],
    ])
  })

  it('ignores album rows with no chat-photo source key', () => {
    const plain = album('a1', 'avatar.jpg', { sourceKey: 'batch:abc' })
    const plan = planRepair({ avatars: [plain], images: [] })
    expect(plan.avatarOps).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('does not drop the object when the copy already names the media object', () => {
    const m = media('m1', 'selfie.jpg')
    const a = album('a1', 'selfie.jpg', { sourceKey: 'chat-photo:m1' })
    const [op] = planRepair({ avatars: [a], images: [m] }).avatarOps
    expect(op?.op).toBe('relink-legacy')
    expect(op?.drops).toEqual([])
  })
})

describe('planRepair — pointers', () => {
  it('refreshes a stale pointer and leaves a fresh one alone', () => {
    const m1 = media('m1', 'selfie-v2.jpg')
    const m2 = media('m2', 'selfie-b.jpg')
    const stale = album('a1', 'selfie-v1.jpg', { sourceImageId: 'm1', sourceKey: 'chat-photo:m1' })
    const fresh = album('a2', 'selfie-b.jpg', { sourceImageId: 'm2', sourceKey: 'chat-photo:m2' })
    const plan = planRepair({ avatars: [stale, fresh], images: [m1, m2] })
    expect(plan.avatarOps.map((op: { id: string; op: string }) => [op.id, op.op])).toEqual([
      ['a1', 'refresh-pointer'],
    ])
    expect(plan.avatarOps[0]?.drops).toEqual([
      { userId: U, pathname: stale.pathname, blobUrl: stale.blobUrl },
    ])
  })
})

describe('planRepair — references', () => {
  it('refreshes a stale image→image reference with the original’s byte columns', () => {
    const o = media('o1', 'selfie-v2.jpg')
    const r = media('r1', 'selfie-v1.jpg', {
      sourceImageId: 'o1',
      contentHash: 'old',
      description: 'prose about v1',
    })
    const [op] = planRepair({ avatars: [], images: [o, r] }).refOps
    expect(op?.op).toBe('refresh-image-ref')
    expect(op?.guard).toEqual({ table: 'nina_message_images', id: 'o1' })
    expect(op?.to).toMatchObject({
      pathname: o.pathname,
      blobUrl: o.blobUrl,
      contentHash: o.contentHash,
      // Decision D2: a reference mirrors its target's prose — the v1 prose does not survive.
      description: o.description,
      perceptualHash: o.perceptualHash,
      perceptualSig: o.perceptualSig,
    })
    expect(op?.drops).toEqual([{ userId: U, pathname: r.pathname, blobUrl: r.blobUrl }])
  })

  it('moves an image→avatar reference along with a relinked legacy copy (post-repair bytes)', () => {
    const m = media('m1', 'selfie-v2.jpg')
    const a = album('a1', 'avatar-v1.jpg', { sourceKey: 'chat-photo:m1' })
    // Not stale today: it names exactly what the legacy copy names.
    const r = media('r1', 'avatar-v1.jpg', { sourceAvatarId: 'a1', kind: 'generated' })
    const plan = planRepair({ avatars: [a], images: [m, r] })
    expect(plan.refOps).toHaveLength(1)
    expect(plan.refOps[0]?.op).toBe('refresh-avatar-ref')
    expect(plan.refOps[0]?.guard).toEqual({ table: 'nina_message_images', id: 'm1' })
    expect(plan.refOps[0]?.to.pathname).toBe(m.pathname)
    // The prose is the Media row's, not the legacy copy's (a pointer's own prose is dead).
    expect(plan.refOps[0]?.to.description).toBe(m.description)
    // Both the copy and the reference drop the same object — one candidate, not two.
    expect(collectReleaseCandidates([...plan.avatarOps, ...plan.refOps])).toEqual([
      { userId: U, pathname: a.pathname, blobUrl: a.blobUrl },
    ])
  })

  it('compares a reference to a plain album row against that row, with no perceptual columns', () => {
    const a = album('a1', 'avatar-new.jpg')
    const r = media('r1', 'avatar-old.jpg', { sourceAvatarId: 'a1' })
    const [op] = planRepair({ avatars: [a], images: [r] }).refOps
    expect(op?.guard).toEqual({ table: 'nina_avatars', id: 'a1' })
    expect(op?.to.perceptualHash).toBeNull()
    expect(op?.to.perceptualSig).toBeNull()
    expect(op?.to.contentHash).toBe('legacy-hash')
    expect(op?.to.description).toBe('album prose')
  })

  it('copies a NULL target description as NULL rather than keeping prose about the old bytes', () => {
    const o = media('o1', 'selfie-v2.jpg', { description: null })
    const r = media('r1', 'selfie-v1.jpg', { sourceImageId: 'o1', description: 'prose about v1' })
    const [op] = planRepair({ avatars: [], images: [o, r] }).refOps
    expect(op?.to.description).toBeNull()
  })

  it('leaves a reference that already names its target alone, even with NULL dims', () => {
    const o = media('o1', 'selfie.jpg')
    const r = media('r1', 'selfie.jpg', {
      sourceImageId: 'o1',
      width: null,
      height: null,
      bytes: null,
    })
    expect(planRepair({ avatars: [], images: [o, r] }).refOps).toEqual([])
  })

  it('never crosses users', () => {
    const o = media('o1', 'selfie.jpg', { userId: 'user-2' })
    const r = media('r1', 'other.jpg', { sourceImageId: 'o1' })
    const plan = planRepair({ avatars: [], images: [o, r] })
    expect(plan.refOps).toEqual([])
    expect(plan.skipped).toHaveLength(1)
  })
})

describe('summarizePlan', () => {
  it('counts each class', () => {
    const m = media('m1', 'v2.jpg')
    const plan = planRepair({
      avatars: [
        album('a1', 'v1.jpg', { sourceKey: 'chat-photo:m1' }),
        album('a2', 'v1b.jpg', { sourceImageId: 'm1', sourceKey: 'x' }),
      ],
      images: [m, media('r1', 'v1.jpg', { sourceImageId: 'm1' })],
    })
    expect(summarizePlan(plan)).toEqual({
      legacyRelinks: 1,
      pointerRefreshes: 1,
      imageRefRefreshes: 1,
      avatarRefRefreshes: 0,
      skipped: 0,
    })
  })
})

describe('parseRepairArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseRepairArgs([])).toEqual({ apply: false, backup: null })
  })
  it('takes --apply and --backup <path>', () => {
    expect(parseRepairArgs(['--apply', '--backup', '/tmp/x.json'])).toEqual({
      apply: true,
      backup: '/tmp/x.json',
    })
  })
  it('refuses unknown flags and a bare --backup', () => {
    expect(() => parseRepairArgs(['--delete'])).toThrow(/unknown flag/)
    expect(() => parseRepairArgs(['--backup'])).toThrow(/needs a file path/)
    expect(() => parseRepairArgs(['--backup', '--apply'])).toThrow(/needs a file path/)
  })
})

describe('resolveBackupPath', () => {
  const repo = path.resolve('/work/repo')
  it('defaults outside the repo', () => {
    const p = resolveBackupPath(null, new Date('2026-10-03T00:00:00Z'), repo)
    expect(isInside(p, repo)).toBe(false)
    expect(path.basename(p)).toBe('nina-profpic-pointer-repair-2026-10-03T00-00-00-000Z.json')
  })
  it('refuses a path inside the repo', () => {
    expect(() => resolveBackupPath('/work/repo/backup.json', new Date(), repo)).toThrow(
      /inside the repository/,
    )
  })
  it('accepts an explicit path elsewhere', () => {
    expect(resolveBackupPath('/elsewhere/b.json', new Date(), repo)).toBe(
      path.resolve('/elsewhere/b.json'),
    )
  })
})
