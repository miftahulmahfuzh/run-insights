import { and, eq, isNull } from 'drizzle-orm'

import { newShareToken } from '@/lib/id'

import { db } from '../index'
import { type Share, shares } from '../schema'

import { NotFoundError } from './errors'
import { assertRunOwned } from './ownership'

/* ============================================================================
 * §8 — share tokens. Revocation is a soft delete; the token is the credential.
 * ==========================================================================*/

export async function createShare(userId: string, runId: string): Promise<{ token: string }> {
  await assertRunOwned(userId, runId)
  const existing = await getActiveShareForRun(userId, runId)
  // The partial unique index would refuse a second active token anyway; returning the live one is
  // the useful behaviour for a "Share" button pressed twice.
  if (existing) return { token: existing.token }
  const token = newShareToken()
  await db.insert(shares).values({ token, userId, runId })
  return { token }
}

export async function getActiveShareForRun(userId: string, runId: string): Promise<Share | null> {
  const rows = await db
    .select()
    .from(shares)
    .where(and(eq(shares.runId, runId), eq(shares.userId, userId), isNull(shares.revokedAt)))
    .limit(1)
  return rows[0] ?? null
}

/** Revocation is a soft delete: the row stays, so re-sharing mints a fresh token (R-15). */
export async function revokeShare(userId: string, token: string): Promise<void> {
  const rows = await db
    .update(shares)
    .set({ revokedAt: new Date() })
    .where(and(eq(shares.token, token), eq(shares.userId, userId), isNull(shares.revokedAt)))
    .returning({ token: shares.token })
  if (rows.length === 0) throw new NotFoundError('Share not found')
}
