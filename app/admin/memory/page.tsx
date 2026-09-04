import { MemoryLedger } from '@/components/admin/MemoryLedger'
import { MemorySlots } from '@/components/admin/MemorySlots'
import { UserPicker } from '@/components/admin/UserPicker'
import { ADMIN_LEDGER_PAGE, factPermissions, type FactCard } from '@/lib/admin/memoryModel'
import { adminReadFacts, adminReadSlot, adminReadSlots } from '@/lib/admin/memoryStore'
import { buildSlotCards } from '@/lib/admin/memoryVocab'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { getAdminUser, listAdminUsers } from '@/lib/admin/users'
import {
  NINA_SLOT_PENDING_PROMISES,
  type NinaPendingPromise,
  type NinaPendingPromisesSlot,
} from '@/lib/db/schema'

/**
 * `/admin/memory` — R24 in full: *"admin can see the persistent memory that is collected for each
 * user. and admin can edit them as well."*
 *
 * ── ONE ROUTE, A `?user=` PARAM ─────────────────────────────────────────────────────────────
 * There is one user today, so `/admin/memory/[userId]` would make the picker a mandatory
 * click-through past a list of one. The page is nonetheless per-user in every respect: the param
 * is validated, `getAdminUser` confirms the account exists, and every read and write below takes
 * that id FIRST (invariant 7). Absent `?user`, the default is **the signed-in admin's own id** —
 * deterministic, and exactly the account R24's backdoor is about. "First user by email" was
 * rejected: a second account signing in would silently move the default.
 *
 * ── `force-dynamic` ─────────────────────────────────────────────────────────────────────────
 * The page is per-request state that must reflect the action that just ran, exactly like
 * `/admin/nina`. `revalidatePath('/admin/memory')` in each action makes that immediate.
 *
 * ── WHY THE CARDS ARE BUILT HERE AND NOT IN THE COMPONENTS ──────────────────────────────────
 * `buildSlotCards` reads phase 5's `NINA_SLOT_SPECS`, which reaches zod and `lib/db/schema.ts`.
 * Building the cards on the server means the `'use client'` components below receive plain
 * serializable props and import only `lib/admin/memoryModel.ts` (zero value imports), so no part
 * of the vocabulary or the drizzle schema is ever bundled for the browser.
 */

export const dynamic = 'force-dynamic'

export default async function AdminMemoryPage(props: PageProps<'/admin/memory'>) {
  const { userId: adminUserId } = await requireAdmin()

  const search = await props.searchParams
  const requested = typeof search.user === 'string' ? search.user : null
  const targetId = requested ?? adminUserId

  const [users, target] = await Promise.all([listAdminUsers(), getAdminUser(targetId)])

  if (target == null) {
    return (
      <div>
        <Header />
        <UserPicker users={users} selectedId={null} />
        <p className="mt-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          No account with that id. Pick one above — this is &ldquo;which user&rsquo;s memory&rdquo;,
          not &ldquo;no memory&rdquo;.
        </p>
      </div>
    )
  }

  const [slotRows, factRows, promisesSlot] = await Promise.all([
    adminReadSlots(target.id),
    adminReadFacts(target.id, ADMIN_LEDGER_PAGE),
    adminReadSlot(target.id, NINA_SLOT_PENDING_PROMISES),
  ])

  const slots = buildSlotCards(slotRows)

  const promises: NinaPendingPromise[] = (() => {
    if (promisesSlot == null) return []
    const value = promisesSlot.value as NinaPendingPromisesSlot
    return Array.isArray(value?.promises) ? value.promises : []
  })()

  // `NinaFactRow` carries a `Date`; the card carries a string, so nothing about serialization
  // depends on how the RSC boundary treats `Date` today.
  const facts: FactCard[] = factRows.map((row) => {
    const permissions = factPermissions(row)
    return {
      id: row.id,
      category: row.category,
      text: row.text,
      confidence: row.confidence,
      origin: row.source,
      sourceMessageId: row.sourceMessageId,
      createdAt: row.createdAt.toISOString(),
      canEditInPlace: permissions.canEditInPlace,
      editNote: permissions.editNote,
    }
  })

  const hidden = Math.max(0, target.facts - facts.length)

  return (
    <div>
      <Header />
      <UserPicker users={users} selectedId={target.id} />

      <div className="mt-8 space-y-8">
        <MemorySlots userId={target.id} slots={slots} promises={promises} />
        <MemoryLedger userId={target.id} facts={facts} hiddenCount={hidden} total={target.facts} />
      </div>
    </div>
  )
}

/**
 * Split out only so the "no such user" branch above and the normal branch share it verbatim. It
 * says the two things the admin has to know before touching anything: this writes production, and
 * her next turn reads it.
 */
function Header() {
  return (
    <header className="mb-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Memory</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Everything Nina has kept: the nine <strong>slots</strong> she is handed on every turn, and
        the append-only <strong>ledger</strong> of what she has been told. Edits here write
        production and she reads them on her very next message — there is no distillation pass and
        no cache in between.
      </p>
    </header>
  )
}
