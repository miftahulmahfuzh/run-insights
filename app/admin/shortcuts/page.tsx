import { ShortcutTable } from '@/components/admin/ShortcutTable'
import { UserPicker } from '@/components/admin/UserPicker'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { ADMIN_SHORTCUT_PAGE, buildShortcutRows } from '@/lib/admin/shortcutModel'
import { adminReadShortcuts } from '@/lib/admin/shortcutStore'
import { getAdminUser, listAdminUsers } from '@/lib/admin/users'

/**
 * `/admin/shortcuts` — R1: *"i want a mechanism that is more explicit, that is shortcuts. in
 * shortcuts admin can add shortcuts that entails some situations or what miftah and nina were
 * doing."*
 *
 * ── ONE ROUTE, A `?user=` PARAM ─────────────────────────────────────────────────────────────
 * `/admin/memory`'s ruling, unchanged: there is one user today, so `/admin/shortcuts/[userId]`
 * would make the picker a mandatory click-through past a list of one. The page is nonetheless
 * per-user in every respect — the param is validated, `getAdminUser` confirms the account exists,
 * and every read and write takes that id FIRST (invariant 5). Absent `?user`, the default is the
 * signed-in admin's own id.
 *
 * `PageProps<'/admin/shortcuts'>` is Next 16's globally available helper — not an import — and
 * `searchParams` is a PROMISE that must be awaited
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
 * Helper" and "searchParams (optional)"). `npm run typecheck` runs `next typegen` first, which is
 * what generates the literal for this new route.
 *
 * ── `force-dynamic` ─────────────────────────────────────────────────────────────────────────
 * Per-request state that must reflect the action that just ran, exactly like `/admin/memory` and
 * `/admin/nina`. Each action's `revalidatePath('/admin/shortcuts')` makes that immediate, and the
 * re-rendered payload rides back in the action's own response.
 *
 * ── WHY THE ROWS ARE BUILT HERE AND NOT IN THE TABLE ────────────────────────────────────────
 * `adminReadShortcuts` is `server-only` and hands back `Date`s. Building the rows here means
 * `ShortcutTable` receives plain serializable props and imports one `lib/admin` module with no
 * value import except three numbers — so no drizzle table and no zod schema is ever bundled for
 * the browser. `tests/admin.shortcuts.test.ts` asserts that structurally rather than intending it.
 */

export const dynamic = 'force-dynamic'

export default async function AdminShortcutsPage(props: PageProps<'/admin/shortcuts'>) {
  const { userId: adminUserId } = await requireAdmin()

  const search = await props.searchParams
  const requested = typeof search.user === 'string' ? search.user : null
  const targetId = requested ?? adminUserId

  const [users, target] = await Promise.all([listAdminUsers(), getAdminUser(targetId)])

  if (target == null) {
    return (
      <div>
        <Header />
        <UserPicker users={users} selectedId={null} basePath="/admin/shortcuts" />
        <p className="mt-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          No account with that id. Pick one above — this is &ldquo;whose shortcuts&rdquo;, not
          &ldquo;no shortcuts&rdquo;.
        </p>
      </div>
    )
  }

  // `ShortcutSource` carries `Date`s; a `ShortcutRow` carries ISO strings, so nothing about
  // serialization depends on how the RSC boundary treats `Date` today.
  const rows = buildShortcutRows(await adminReadShortcuts(target.id, ADMIN_SHORTCUT_PAGE))

  return (
    <div>
      <Header />
      <UserPicker users={users} selectedId={target.id} basePath="/admin/shortcuts" />
      <ShortcutTable userId={target.id} rows={rows} />
    </div>
  )
}

/**
 * Split out only so the "no such user" branch and the normal branch share it verbatim. It says the
 * three things the operator has to know before touching anything: this writes production, she reads
 * it on her very next message, and a shortcut only fires when its trigger is in something HE typed.
 */
function Header() {
  return (
    <header className="mb-5 lg:mb-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Shortcuts</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
        A short <strong>trigger</strong> and the whole long context it stands in for. A cell saves
        when you leave it, the checkbox at the start of a row saves the moment it changes, and a row
        deletes on one click — no confirmation anywhere. Edits here write production and she reads
        them on her very next message; there is no distillation pass and no cache in between. A
        shortcut fires only when its trigger appears in something <strong>you</strong> type — never
        in something she says — and a message with no trigger in it carries none of this at all.
      </p>
    </header>
  )
}
