/* ============================================================================
 * The whole database, split into domain modules behind this barrel. The v0.1.0
 * contract docs (ROADMAP_v0.1.0.md, §4.3 for every column; RECONCILIATION_v0.1.0.md) are
 * retired — the rulings survive in
 * `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md`, and each amendment is marked in the
 * modules with their ruling (R-1, R-5, R-7, R-8, R-9, R-11, R-12, R-13, R-22, R-28). Where a
 * module and a feature plan disagree, the rulings win — see docs/plans/archive/F03-data-layer.md
 * §10.
 *
 * Layout (each module owns its tables, relations and row types):
 *
 *   - `./schema/auth`          — Auth.js adapter tables + `users`, the FK root of every domain
 *   - `./schema/runs`          — the training domain: profiles, extractions, runs, splits, zones,
 *                                photos, insights, records, badges, shares
 *   - `./schema/nina/chat`     — nina turns, chat sessions, messages, message images
 *   - `./schema/nina/memory`   — memory slots, memory facts, shortcuts, nags
 *   - `./schema/nina/avatars`  — avatars and folders
 *   - `./schema/nina/config`   — tuning and image-generation prefs (per-user UI controls)
 *   - `./schema/admin`         — app-wide settings and nina's error log (operator-facing)
 *   - `./schema/push`          — web-push subscriptions
 *
 * THIS file stays the single import path: drizzle.config.ts pins `./lib/db/schema.ts`, and
 * `lib/db/index.ts` re-exports it — every consumer imports from '@/lib/db/schema' and none may
 * reach into a domain module directly.
 *
 * Two rules that are invisible in the column list but govern the whole schema:
 *
 *   - **Integers in the smallest sensible unit** (roadmap D5). Distance is metres, duration and
 *     pace are seconds. `profiles.weight_kg` is the single deliberate exception among MEASURED
 *     values; `nina_avatars.crop_scale` is a display transform rather than a measurement and is
 *     `numeric` for the same reason a zoom factor is not an integer. Floats summed over a month
 *     drift visibly; integers do not.
 *   - **`runs.reviewed_at IS NOT NULL` gates every aggregate** (roadmap D16 / R-13). The column
 *     is declared in schema/runs.ts; the filter is enforced in lib/db/queries/ and asserted by
 *     tests/db.queries.reviewedOnly.test.ts.
 */

/* ============================================================================
 * Relations. The sanctioned read path is explicit selects inside db.batch
 * (getRunDetail), because that is one HTTP round trip and one snapshot. These
 * cost nothing at runtime and keep db.query.* available if a later feature wants
 * a relational read.
 *
 * Each relation is declared in the module that owns its table.
 * ==========================================================================*/

/* ============================================================================
 * Row types. Import these instead of re-deriving $inferSelect at call sites.
 * ==========================================================================*/

export * from './schema/auth'
export * from './schema/runs'
export * from './schema/nina/chat'
export * from './schema/nina/memory'
export * from './schema/nina/avatars'
export * from './schema/nina/config'
export * from './schema/admin'
export * from './schema/push'
