import 'server-only'

import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'

import {
  NINA_CHAT_FALLBACK_DEFAULT_MODEL,
  NINA_CHAT_FALLBACK_MODEL_IDS,
  type NinaChatFallbackModelId,
} from './openrouter'

/**
 * **Which model the chat turn's OpenRouter fallback dials — read live, overridable with no
 * deploy.** `lib/llm/textModel.ts`'s exact shape, one `app_settings` row over: the dropdown on
 * `/admin/personality` writes it, `ninaFallbackTextClient` reads it at the moment it needs it, and
 * a switch is in force on the next fallback attempt with no invalidation step and no redeploy.
 *
 * ── WHY A SEPARATE ROW FROM `text_model` ─────────────────────────────────────────────────────
 * They answer different questions — "which model writes every turn" vs. "which model rescues one
 * when the primary fails" — and the catalogs do not even share an id shape (`glm-5.3` vs.
 * `z-ai/glm-5.3-flash`, an OpenRouter slug). One row holding both would need a second column just
 * to tell them apart.
 */

const CHAT_FALLBACK_MODEL_KEY = 'text_fallback_model'

/**
 * **The model id the next OpenRouter fallback attempt will use.** Never throws: a settings read
 * that cannot happen must not cost a turn that has already spent its primary attempt — the same
 * argument `narrativeModel()`'s header makes, word for word.
 */
export async function ninaChatFallbackModel(): Promise<string> {
  let value: string | null = null
  try {
    const result = await db.execute(
      sql`select value from app_settings where key = ${CHAT_FALLBACK_MODEL_KEY} limit 1`,
    )
    const row = result.rows[0] as { value?: unknown } | undefined
    if (typeof row?.value === 'string') value = row.value
  } catch (cause) {
    console.warn(
      `[nina] app_settings.text_fallback_model could not be read — falling back to ${NINA_CHAT_FALLBACK_DEFAULT_MODEL}`,
      { error: String(cause) },
    )
    return NINA_CHAT_FALLBACK_DEFAULT_MODEL
  }
  if (value == null) return NINA_CHAT_FALLBACK_DEFAULT_MODEL
  if ((NINA_CHAT_FALLBACK_MODEL_IDS as readonly string[]).includes(value)) return value
  console.warn(
    `[nina] app_settings.text_fallback_model holds an unknown id "${value}" — falling back to ${NINA_CHAT_FALLBACK_DEFAULT_MODEL}`,
  )
  return NINA_CHAT_FALLBACK_DEFAULT_MODEL
}

/**
 * The write half, for the admin action only. The argument is the NARROW id, so the store can only
 * ever hold a value the catalog declares — the coerce-at-read above is the net for hand-run SQL,
 * not for our own writer.
 */
export async function writeNinaChatFallbackModel(model: NinaChatFallbackModelId): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: CHAT_FALLBACK_MODEL_KEY, value: model })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: model, updatedAt: new Date() },
    })
}
