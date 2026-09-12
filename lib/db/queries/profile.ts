import { eq } from 'drizzle-orm'

import { db } from '../index'
import { type NewProfile, type Profile, profiles } from '../schema'

/* ============================================================================
 * §8 — the runner profile.
 * ==========================================================================*/

export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
  return rows[0] ?? null
}

/** Upsert — no profile row exists until onboarding saves one. */
export async function upsertProfile(
  userId: string,
  patch: Partial<Omit<NewProfile, 'userId'>>,
): Promise<void> {
  await db
    .insert(profiles)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...patch, updatedAt: new Date() } })
}
