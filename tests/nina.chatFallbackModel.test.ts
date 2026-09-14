import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NINA_CHAT_FALLBACK_DEFAULT_MODEL,
  NINA_CHAT_FALLBACK_MODEL_IDS,
  NINA_CHAT_FALLBACK_MODEL_SPECS,
} from '@/lib/nina/openrouter'
import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

describe('the chat-fallback-model catalog', () => {
  it('offers exactly the ids verified live against OpenRouter', () => {
    expect([...NINA_CHAT_FALLBACK_MODEL_IDS].sort()).toEqual(
      ['nvidia/nemotron-3.5-lightning', 'z-ai/glm-5.3-flash'].sort(),
    )
    for (const id of NINA_CHAT_FALLBACK_MODEL_IDS) {
      expect(NINA_CHAT_FALLBACK_MODEL_SPECS[id].label.length).toBeGreaterThan(0)
      expect(NINA_CHAT_FALLBACK_MODEL_SPECS[id].hint.length).toBeGreaterThan(0)
    }
  })

  it('the default fallback model is an id this catalog declares', () => {
    /* `ninaChatFallbackModel` degrades every unreadable or absent setting to the default, so the
     * default and the dropdown's vocabulary must describe the same set — the same pin
     * `tests/llm.textModel.test.ts` holds for `env.LLM_MODEL`. */
    expect(NINA_CHAT_FALLBACK_MODEL_IDS).toContain(NINA_CHAT_FALLBACK_DEFAULT_MODEL)
  })
})

describe('ninaChatFallbackModel — the app_settings override, read live', () => {
  let fake: FakeDb
  let chatFallbackModel: typeof import('@/lib/nina/chatFallbackModel')

  beforeEach(async () => {
    /* resetModules first: `lib/db/index.ts` builds its client once per module instance, so each
     * test's fresh fake needs a fresh import — `tests/llm.textModel.test.ts`'s own pattern. */
    vi.resetModules()
    fake = installFakeDb()
    chatFallbackModel = await import('@/lib/nina/chatFallbackModel')
  })

  afterEach(() => {
    uninstallFakeDb()
    vi.resetModules()
  })

  it('falls back to the default model when no setting row exists', async () => {
    fake.enqueue([[]])
    await expect(chatFallbackModel.ninaChatFallbackModel()).resolves.toBe(
      NINA_CHAT_FALLBACK_DEFAULT_MODEL,
    )
    expect(fake.only().sql).toContain('app_settings')
  })

  it('returns the stored id when the catalog declares it', async () => {
    /* `db.execute` reads `result.rows` un-mapped, so the enqueued shape is the ROWS ARRAY itself. */
    fake.enqueue([{ key: 'text_fallback_model', value: 'nvidia/nemotron-3.5-lightning' }])
    await expect(chatFallbackModel.ninaChatFallbackModel()).resolves.toBe(
      'nvidia/nemotron-3.5-lightning',
    )
  })

  it('degrades an unknown stored id to the default model, loudly', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      fake.enqueue([{ key: 'text_fallback_model', value: 'some/nonexistent-model' }])
      await expect(chatFallbackModel.ninaChatFallbackModel()).resolves.toBe(
        NINA_CHAT_FALLBACK_DEFAULT_MODEL,
      )
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('degrades to the default model when the read itself throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      fake.enqueueError(new Error('connection reset'))
      await expect(chatFallbackModel.ninaChatFallbackModel()).resolves.toBe(
        NINA_CHAT_FALLBACK_DEFAULT_MODEL,
      )
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('writeNinaChatFallbackModel upserts the one fixed row', async () => {
    await chatFallbackModel.writeNinaChatFallbackModel('nvidia/nemotron-3.5-lightning')
    expect(fake.only().sql).toContain('on conflict')
    expect(fake.last().params).toContain('text_fallback_model')
  })
})

describe('saveChatFallbackModelAction — the boundary', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../lib/admin/chatFallbackModelActions.ts', import.meta.url)),
    'utf8',
  )

  it('opens with requireAdmin, before any use of the argument', () => {
    expect(source.indexOf('await requireAdmin()')).toBeGreaterThanOrEqual(0)
    expect(source.indexOf('await requireAdmin()')).toBeLessThan(source.indexOf('safeParse'))
    expect(source).toContain("revalidatePath('/admin/personality')")
  })

  it('refuses a model outside the catalog before it writes', () => {
    expect(source).toContain('z.enum(NINA_CHAT_FALLBACK_MODEL_IDS)')
    expect(source.indexOf('safeParse')).toBeLessThan(source.indexOf('writeNinaChatFallbackModel('))
  })
})
