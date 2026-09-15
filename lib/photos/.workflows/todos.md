# Todos: photos

**Package Path**: `lib/photos`
**Package Code**: PHO
**Last Updated**: 2026-09-15
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1
- Archived: 0

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

- [x] **P1-PHO-Q7XK** Phase 1: Schema + cross-table dedup detection + push kind
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the `content_hash` migration on `run_photos`/`nina_avatars`, the two new per-table content-hash finders, the shared read-only `findGlobalDuplicatePhoto(userId, contentHash, {exclude})` cross-table lookup (`lib/photos/globalDuplicate.ts`), the `/photo/<kind>/<id>` URL grammar owned end-to-end by `lib/photos/pointer.ts`, and the new `duplicate_image` push kind + `notifyDuplicateImagePush(userId, pointer)` helper. Nothing calls any of it yet — phases 2/3/4 do.
  - **Status**: completed
  - **Plan Set**: `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` (phase 1 of 4)
  - **Satisfies**: R1 and R2 — Push notification on any upload route when the image already exists in the whole app image collection; clicking the notification opens the client app to a full-screen view of the saved (original) image
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-PHO-Q7XK.md`
  - **Completed**: 2026-09-15 09:53
  - **Method**: /implement (plan set phase 1 of 4)
  - **Files**: lib/db/schema/runs.ts, lib/db/schema/nina/avatars.ts, drizzle/0022_nostalgic_rachel_grey.sql, drizzle/meta/0022_snapshot.json, drizzle/meta/_journal.json, lib/photos/pointer.ts, lib/photos/pointer.test.ts, lib/db/queries/photos.ts, lib/nina/queries/avatars.ts, lib/nina/queries.test.ts, lib/photos/globalDuplicate.ts, lib/photos/globalDuplicate.test.ts, lib/push/payload.ts, lib/push/payload.test.ts, lib/push/send.ts, lib/push/duplicateImage.ts, lib/push/duplicateImage.test.ts, tests/db.schema.test.ts, tests/db.schema.nina.test.ts
  - **Verified**: `npx tsc --noEmit` clean; targeted suite (`lib/photos/pointer.test.ts`, `lib/photos/globalDuplicate.test.ts`, `lib/push/duplicateImage.test.ts`, `lib/push/payload.test.ts`, `lib/nina/queries.test.ts`, `tests/db.schema.test.ts`, `tests/db.schema.nina.test.ts`) 171/171 passed; full `npm test` 341 files / 5917 tests passed; `npm run lint` clean; `npm run db:check` clean ("Everything's fine").
  - **Note**: `npm run ci:schema-drift-guard` reports 8 findings against the live database — 4 are pre-existing and unrelated to this phase (an orphan applied-migration hash, `nina_avatars.description_embedding` + its hnsw index missing from schema), and 4 are this migration's own additive columns/indexes (`run_photos.content_hash`, `nina_avatars.content_hash`, their two indexes) not yet present in the database. Per the plan's own text, generating `drizzle/0022_*` is phase 1's job; applying it against `.env.local`'s `DATABASE_URL` (production) is an explicit deploy-time decision left to the operator, not a phase 1 gate. No drift, no decisions beyond what the plan already ratified during reconciliation.

---

## Archive

(none yet)
