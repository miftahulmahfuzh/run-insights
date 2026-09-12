import 'server-only'

import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { env } from '@/lib/env'

import { NARRATIVE_TEXT_MODEL_IDS, type NarrativeTextModelId } from './catalog'

/**
 * **Which GLM writes every text turn — read live, overridable with no deploy.**
 *
 * The 2026-09-10 ask, resolver half: the dropdown on `/admin/personality` writes one
 * `app_settings` row, and every text call in the app reads it HERE, at the moment it dials — the
 * same no-cache discipline the image path states for the prefs row. A switch is in force on the
 * next turn, with no invalidation step and no redeploy, which is the whole reason the setting is
 * a database row rather than a Vercel variable.
 *
 * ── WHY A RESOLVER AND NOT `env.LLM_MODEL` AT THE CALL SITES ─────────────────────────────────
 * `narrativeModel()` was already the ONE seam — *"the model id, read once at the call site so a
 * test can pass its own"* — with exactly seven readers (Nina's turns via `ninaModel`, captions,
 * autotitles, distillation, semantic ranking, insights rollup). An override that edited env vars
 * would have kept that seam and reintroduced the deploy; an override that edited seven call sites
 * would have been seven seams. The seam stays; what it reads changes.
 *
 * ── THE DEGRADE, AND WHY IT LANDS ON ENV RATHER THAN THE CATALOG ─────────────────────────────
 * The shipped id is in the catalog, but the ENV is what this deploy was verified against — the
 * catalog is the dropdown's vocabulary, the env is the operator's infrastructure decision. So: a
 * row holding a declared id wins; a row holding anything else is a loud warning plus
 * `env.LLM_MODEL`; no row at all is `env.LLM_MODEL`. An unknown id must never reach the
 * provider — it would fail after the turn's tokens were spent — and it must not fail silently,
 * because a silent model swap is Nina waking up with a different voice.
 */

/** The one row this resolver reads. A second writer would be a second spelling of the key. */
const TEXT_MODEL_KEY = 'text_model'

/**
 * **The model id the next text call will use.** Async now, and every reader awaits it — one
 * indexed primary-key read per text call, on paths that already read the tuning, the prefs or the
 * session, and nowhere on a hot loop.
 *
 * A raw `db.execute` rather than the query builder: the read wants ONE column and nothing else,
 * and execute returns the driver's rows un-mapped — one less mapping layer between the row and
 * the string a turn is about to dial with.
 *
 * **Never throws.** A settings read that cannot happen must not cost a turn: a database failure
 * here is warned and answered with `env.LLM_MODEL`, the same degrade an unreadable or unknown
 * value gets. `runTurnDistillation`'s contract is the reason in so many words — the model id is
 * resolved BEFORE its never-throw floor begins, so this function has to hold the floor itself.
 */
export async function narrativeModel(): Promise<string> {
  let value: string | null = null
  try {
    const result = await db.execute(
      sql`select value from app_settings where key = ${TEXT_MODEL_KEY} limit 1`,
    )
    const row = result.rows[0] as { value?: unknown } | undefined
    if (typeof row?.value === 'string') value = row.value
  } catch (cause) {
    console.warn(`[llm] app_settings.text_model could not be read — falling back to env`, {
      error: String(cause),
    })
    return env.LLM_MODEL
  }
  if (value == null) return env.LLM_MODEL
  if ((NARRATIVE_TEXT_MODEL_IDS as readonly string[]).includes(value)) return value
  console.warn(
    `[llm] app_settings.text_model holds an unknown id "${value}" — falling back to ${env.LLM_MODEL}`,
  )
  return env.LLM_MODEL
}

/**
 * The write half, for the admin action only. The argument is the NARROW id, so the store can only
 * ever hold a value the catalog declares — the coerce-at-read in `narrativeModel` is the net for
 * hand-run SQL, not for our own writers.
 */
export async function writeNarrativeTextModel(model: NarrativeTextModelId): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: TEXT_MODEL_KEY, value: model })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: model, updatedAt: new Date() },
    })
}
