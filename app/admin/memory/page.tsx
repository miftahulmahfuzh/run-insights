import { MemoryTable } from '@/components/admin/MemoryTable'
import { UserPicker } from '@/components/admin/UserPicker'
import { ADMIN_LEDGER_PAGE } from '@/lib/admin/memoryModel'
import { adminReadFacts, adminReadSlot, adminReadSlots } from '@/lib/admin/memoryStore'
import { buildMemoryRows } from '@/lib/admin/memoryVocab'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { getAdminUser, listAdminUsers } from '@/lib/admin/users'
import {
  NINA_SLOT_PENDING_PROMISES,
  type NinaPendingPromise,
  type NinaPendingPromisesSlot,
} from '@/lib/db/schema'

/**
 * `/admin/memory` — R24 in full (*"admin can see the persistent memory that is collected for each
 * user. and admin can edit them as well."*), rebuilt for R1: *"just make all the memory to show as
 * one simple table."*
 *
 * ── ONE ROUTE, A `?user=` PARAM ─────────────────────────────────────────────────────────────
 * There is one user today, so `/admin/memory/[userId]` would make the picker a mandatory
 * click-through past a list of one. The page is nonetheless per-user in every respect: the param
 * is validated, `getAdminUser` confirms the account exists, and every read and write below takes
 * that id FIRST (invariant 7). Absent `?user`, the default is **the signed-in admin's own id**.
 *
 * `PageProps<'/admin/memory'>` is Next 16's globally available helper — not an import — and
 * `searchParams` is a PROMISE that must be awaited
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
 * Helper" and "searchParams (optional)").
 *
 * ── `force-dynamic` ─────────────────────────────────────────────────────────────────────────
 * The page is per-request state that must reflect the action that just ran, exactly like
 * `/admin/nina`. Each action's `revalidatePath('/admin/memory')` makes that immediate, and the
 * re-rendered payload rides back in the action's own response.
 *
 * ── WHY THE ROWS ARE BUILT HERE AND NOT IN THE TABLE ────────────────────────────────────────
 * `buildMemoryRows` reads phase 5's `NINA_SLOT_SPECS`, which reaches zod and `lib/db/schema.ts`.
 * Building the rows on the server means `MemoryTable` receives plain serializable props and
 * imports only `lib/admin/memoryModel.ts` (zero value imports), so no part of the vocabulary or the
 * drizzle schema is ever bundled for the browser. That property is asserted structurally by
 * `tests/admin.memory.test.ts`, not merely intended.
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

  const promises: NinaPendingPromise[] = (() => {
    if (promisesSlot == null) return []
    const value = promisesSlot.value as NinaPendingPromisesSlot
    return Array.isArray(value?.promises) ? value.promises : []
  })()

  // `NinaSlotRow` and `NinaFactRow` carry `Date`s; a `MemoryRow` carries ISO strings, so nothing
  // about serialization depends on how the RSC boundary treats `Date` today.
  const rows = buildMemoryRows({ slots: slotRows, facts: factRows, promises })
  const hidden = Math.max(0, target.facts - factRows.length)

  return (
    <div>
      <Header />
      <UserPicker users={users} selectedId={target.id} />
      <MemoryTable userId={target.id} rows={rows} factTotal={target.facts} hiddenCount={hidden} />
    </div>
  )
}

/**
 * Split out only so the "no such user" branch above and the normal branch share it verbatim. It
 * says the three things the admin has to know before touching anything: this writes production,
 * her next turn reads it, and nothing here will ask him twice.
 */
function Header() {
  return (
    <header className="mb-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Memory</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Everything Nina has kept, in one table: the <strong>slots</strong> she is handed on every
        turn, her pending <strong>promises</strong>, and the <strong>ledger</strong> of what she has
        been told. A cell saves when you leave it and a row deletes on one click — no confirmation
        anywhere. Edits here write production and she reads them on her very next message; there is
        no distillation pass and no cache in between.
      </p>
    </header>
  )
}
