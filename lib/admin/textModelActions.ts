'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import { z } from 'zod'

import { NARRATIVE_TEXT_MODEL_IDS, type NarrativeTextModelId } from '@/lib/llm/catalog'
import { writeNarrativeTextModel } from '@/lib/llm/textModel'

/**
 * `/admin/personality`'s text-model save — the 2026-09-10 ask, in the user's words: *"dropdown
 * untuk memilih llm untuk seluruh text generation … supaya admin ga perlu deploy ulang vercel kalo
 * mau ganti LLM settings."*
 *
 * ── WHY A SECOND ACTION FILE, AND NOT A FOURTH EXPORT ON `tuningActions.ts` ───────────────────
 * That file's structural test pins it to EXACTLY ONE export — *"one save, not sixteen"* — and the
 * reason is the row it writes: the tuning is one row and every control on the character panel
 * rides one action. The text model is a DIFFERENT store (`app_settings`, not `nina_tuning`) with a
 * different blast radius (every text call in the app, not one panel's row), so it gets its own
 * file, its own gate and its own invariant-6 test below. Co-locating them would have made the
 * one-action-per-row rule unreadable exactly where it matters most.
 *
 * The four lines are `saveNinaImagePrefsAction`'s, in the same order and for the same reasons:
 * the gate FIRST (a Server Action is a POST endpoint whether or not a button exists, and
 * `proxy.ts` matches neither `/admin` nor `/api/*`), then Zod (the client is not a source of
 * truth), then the write, then `revalidatePath`.
 */

const textModelSchema = z.object({
  model: z.enum(NARRATIVE_TEXT_MODEL_IDS),
})

export interface NarrativeTextModelResult {
  ok: boolean
  error?: string
}

/**
 * Save the text model every narrative call will resolve on its NEXT invocation — there is no
 * cache on this path, `narrativeModel()` reads the row live, so the revalidation below is for the
 * page's select showing what was just written, not for the model itself.
 */
export async function saveNarrativeTextModelAction(input: {
  model: string
}): Promise<NarrativeTextModelResult> {
  await requireAdmin()

  const parsed = textModelSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'That is not one of the models this app can write with, so nothing was changed.',
    }
  }

  try {
    await writeNarrativeTextModel(parsed.data.model as NarrativeTextModelId)
    revalidatePath('/admin/personality')
    return { ok: true }
  } catch (cause) {
    console.error('[llm] save narrative text model failed', cause)
    return {
      ok: false,
      error: 'The write failed and nothing was changed — pick the model again to retry.',
    }
  }
}
