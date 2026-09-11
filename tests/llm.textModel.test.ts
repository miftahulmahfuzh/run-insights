import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { env } from '@/lib/env'
import {
  coerceNarrativeTextModel,
  NARRATIVE_TEXT_MODEL_DEFAULT,
  NARRATIVE_TEXT_MODEL_IDS,
  NARRATIVE_TEXT_MODEL_SPECS,
} from '@/lib/llm/catalog'
import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

describe('the text-model catalog (the 2026-09-10 ask)', () => {
  it('offers exactly the two ids verified live on the Anthropic-compatible endpoint', () => {
    expect([...NARRATIVE_TEXT_MODEL_IDS].sort()).toEqual(['glm-5.3', 'glm-5.3-flash'])
    expect(NARRATIVE_TEXT_MODEL_DEFAULT).toBe('glm-5.3')
    for (const id of NARRATIVE_TEXT_MODEL_IDS) {
      expect(NARRATIVE_TEXT_MODEL_SPECS[id].label.length).toBeGreaterThan(0)
      expect(NARRATIVE_TEXT_MODEL_SPECS[id].hint.length).toBeGreaterThan(0)
    }
  })

  it('coerces anything unreadable to the default', () => {
    expect(coerceNarrativeTextModel('glm-5.3-flash')).toBe('glm-5.3-flash')
    for (const bad of [undefined, null, '', 'glm-9', 42]) {
      expect(coerceNarrativeTextModel(bad), String(bad)).toBe(NARRATIVE_TEXT_MODEL_DEFAULT)
    }
  })
})

describe('narrativeModel — the app_settings override, read live', () => {
  let fake: FakeDb
  let textModel: typeof import('@/lib/llm/textModel')

  beforeEach(async () => {
    /* resetModules first: `lib/db/index.ts` builds its client once per module instance, so each
     * test's fresh fake needs a fresh import — the softDelete suite's own pattern. */
    vi.resetModules()
    fake = installFakeDb()
    textModel = await import('@/lib/llm/textModel')
  })

  afterEach(() => {
    uninstallFakeDb()
    vi.resetModules()
  })

  it('falls back to the deployed env model when no setting row exists', async () => {
    fake.enqueue([[]])
    await expect(textModel.narrativeModel()).resolves.toBe(env.LLM_MODEL)
    expect(fake.only().sql).toContain('app_settings')
  })

  it('returns the stored id when the catalog declares it', async () => {
    /* `db.execute` reads `result.rows` un-mapped, so the enqueued shape is the ROWS ARRAY itself —
     * the same convention the getExtractionErrorProfile tests use. */
    fake.enqueue([{ key: 'text_model', value: 'glm-5.3-flash' }])
    await expect(textModel.narrativeModel()).resolves.toBe('glm-5.3-flash')
  })

  it('degrades an unknown stored id to the env model, loudly', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      fake.enqueue([{ key: 'text_model', value: 'glm-9-omg' }])
      await expect(textModel.narrativeModel()).resolves.toBe(env.LLM_MODEL)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('writeNarrativeTextModel upserts the one fixed row', async () => {
    await textModel.writeNarrativeTextModel('glm-5.3-flash')
    expect(fake.only().sql).toContain('on conflict')
    expect(fake.last().params).toContain('text_model')
  })
})

describe('saveNarrativeTextModelAction — the boundary (plan invariant 6)', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../lib/admin/textModelActions.ts', import.meta.url)),
    'utf8',
  )

  it('opens with requireAdmin, before any use of the argument', () => {
    expect(source.indexOf('await requireAdmin()')).toBeGreaterThanOrEqual(0)
    expect(source.indexOf('await requireAdmin()')).toBeLessThan(source.indexOf('safeParse'))
    /* `proxy.ts` matches neither /admin nor /api/*, so this call is the only gate on the
     * endpoint — the same ordering every sibling action file asserts. */
    expect(source).toContain("revalidatePath('/admin/personality')")
  })

  it('refuses a model outside the catalog before it writes', () => {
    expect(source).toContain('z.enum(NARRATIVE_TEXT_MODEL_IDS)')
    expect(source.indexOf('safeParse')).toBeLessThan(source.indexOf('writeNarrativeTextModel('))
  })
})
