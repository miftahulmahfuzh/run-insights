'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import { z } from 'zod'

import { NINA_CHAT_FALLBACK_MODEL_IDS, type NinaChatFallbackModelId } from '@/lib/nina/openrouter'
import { writeNinaChatFallbackModel } from '@/lib/nina/chatFallbackModel'

/**
 * `/admin/personality`'s chat-fallback-model save — `lib/admin/textModelActions.ts`'s exact shape,
 * for the OTHER dropdown: the gate first (a Server Action is a POST endpoint whether or not a
 * button exists, and `proxy.ts` matches neither `/admin` nor `/api/*`), then Zod (the client is
 * not a source of truth), then the write, then `revalidatePath`.
 */

const chatFallbackModelSchema = z.object({
  model: z.enum(NINA_CHAT_FALLBACK_MODEL_IDS),
})

export interface ChatFallbackModelResult {
  ok: boolean
  error?: string
}

/**
 * Save the model the chat turn's OpenRouter fallback will dial on its NEXT attempt — there is no
 * cache on this path, `ninaChatFallbackModel()` reads the row live, so the revalidation below is
 * for the page's select showing what was just written, not for the fallback itself.
 */
export async function saveChatFallbackModelAction(input: {
  model: string
}): Promise<ChatFallbackModelResult> {
  await requireAdmin()

  const parsed = chatFallbackModelSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'That is not one of the models this app can fall back to, so nothing was changed.',
    }
  }

  try {
    await writeNinaChatFallbackModel(parsed.data.model as NinaChatFallbackModelId)
    revalidatePath('/admin/personality')
    return { ok: true }
  } catch (cause) {
    console.error('[nina] save chat fallback model failed', cause)
    return {
      ok: false,
      error: 'The write failed and nothing was changed — pick the model again to retry.',
    }
  }
}
