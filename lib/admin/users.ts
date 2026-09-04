import 'server-only'

import { asc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMemoryFacts, ninaMemorySlots, users } from '@/lib/db/schema'

/**
 * `/admin/memory`'s user picker — R24's *"the persistent memory that is collected for each user"*.
 *
 * ── WHY THIS IS NOT IN `lib/db/queries.ts` ──────────────────────────────────────────────────
 * `scripts/check-data-layer-invariants.mjs` reads that file and fails on any export whose first
 * parameter is not `userId`, with four documented exceptions. `listAdminUsers()` would have to
 * become a fifth — and the honest reason ("an admin page needs to enumerate accounts") is a
 * different kind of reason from the other four, which are all about a single user's data. Adding
 * it there would blunt the guard for every future reader.
 *
 * So the unscoped read lives in `lib/admin/`, behind `requireAdmin()`, next to the only page that
 * makes it meaningful, and `lib/db/queries.ts`'s rule stays literally true. **Everything the page
 * does after the pick is `userId`-first** (invariant 7): `getNinaMemorySlots(userId)`,
 * `listNinaMemoryFacts(userId, …)`, and every writer in `lib/admin/memoryStore.ts`.
 *
 * `import 'server-only'` is what stops a client component from ever reaching `db` through here.
 */

export interface AdminUserRow {
  id: string
  name: string | null
  email: string | null
  /** How many `nina_memory_slots` rows this user has. */
  slots: number
  /** How many `nina_memory_facts` rows this user has — the whole ledger, not the newest page. */
  facts: number
}

/**
 * Every account, with its memory-row counts. Three queries and a join in TypeScript rather than
 * two correlated subqueries: the counts are grouped scans of two small tables, the merge is O(n)
 * over a handful of rows, and it stays readable.
 *
 * `::int` on the counts is load-bearing — Postgres `count(*)` is `bigint`, which the Neon driver
 * hands back as a string, and a string in a `number` field is the kind of bug that only shows up
 * in the rendered page.
 *
 * Ordered by `email` so the picker's order is stable across requests.
 */
export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const [rows, slotCounts, factCounts] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .orderBy(asc(users.email)),
    db
      .select({ userId: ninaMemorySlots.userId, n: sql<number>`count(*)::int` })
      .from(ninaMemorySlots)
      .groupBy(ninaMemorySlots.userId),
    db
      .select({ userId: ninaMemoryFacts.userId, n: sql<number>`count(*)::int` })
      .from(ninaMemoryFacts)
      .groupBy(ninaMemoryFacts.userId),
  ])

  const slots = new Map(slotCounts.map((row) => [row.userId, row.n]))
  const facts = new Map(factCounts.map((row) => [row.userId, row.n]))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    slots: slots.get(row.id) ?? 0,
    facts: facts.get(row.id) ?? 0,
  }))
}

/**
 * Confirm a `?user=` parameter names a real account, and get its display fields.
 *
 * Scoped by id, so this one obeys the ordinary rule. It exists so that a mistyped id renders "no
 * such user" rather than an empty memory page, which would read as "this user has no memory" —
 * the wrong answer to the wrong question.
 */
export async function getAdminUser(userId: string): Promise<AdminUserRow | null> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const row = rows[0]
  if (row == null) return null

  const [slotRows, factRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(ninaMemorySlots)
      .where(eq(ninaMemorySlots.userId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(ninaMemoryFacts)
      .where(eq(ninaMemoryFacts.userId, userId)),
  ])

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    slots: slotRows[0]?.n ?? 0,
    facts: factRows[0]?.n ?? 0,
  }
}
