/**
 * **How wide every `description_embedding` in this schema is, declared once.**
 *
 * It lives in `lib/db/schema/nina/` and not beside `NINA_EMBEDDING_MODEL` in
 * `lib/nina/openrouter.ts` because it is a property of the COLUMNS — the client has to agree with
 * the column, not the other way round — and because every module under `lib/db/schema/` imports
 * only its own siblings today. `drizzle-kit` loads this tree outside Next.js; a `@/lib/nina/...`
 * edge would be the first path alias in its resolution path, bought for nothing.
 * `lib/nina/embedding.ts` imports THIS, through the `@/lib/db/schema` barrel, exactly as
 * `lib/nina/errorlogs.ts` already imports `ninaErrorLogs`.
 *
 * **It is pinned to whatever `NINA_EMBEDDING_MODEL` returned when it was probed.** Two embedding
 * models do not share a vector space, so changing either one without the other does not degrade
 * the ranking — it randomises it, silently, with no error anywhere. Change them together, in one
 * migration, with a full re-embed. Two columns now hold vectors in that one space
 * (`nina_avatars.description_embedding` and, since media-album-unified-search R1,
 * `nina_message_images.description_embedding`), which is the same obligation twice: a re-embed
 * that covered one table and not the other would leave a search ranking two incomparable spaces
 * against one query.
 *
 * **2000 is pgvector's hard ceiling for an HNSW index** (the `vector` type itself allows 16000).
 * A model wider than that would store fine and then fail at `CREATE INDEX` — at migration time,
 * against production.
 *
 * ── WHY THIS IS ITS OWN MODULE AND NOT A LINE IN `./avatars` (2026-09-17) ────────────────────
 * It was declared in `./avatars` until media-album-unified-search R3 gave `nina_avatars` a foreign
 * key into `nina_message_images`, which made `./avatars` and `./chat` a **cycle**: `./chat` has
 * imported `ninaAvatars` since F37, and now `./avatars` imports `ninaMessageImages` back. Both of
 * those edges are LAZY — the value is touched only inside a `(): AnyPgColumn => …` callback that
 * drizzle invokes long after both modules have finished evaluating — and a cycle with only lazy
 * edges is safe in every evaluation order.
 *
 * A constant is not lazy. `vector('description_embedding', { dimensions: … })` reads it while the
 * module body runs, so leaving it in `./avatars` would have made `./chat` depend EAGERLY on a
 * module that is mid-evaluation whenever the graph is entered from the `./avatars` side, and the
 * measured result is `ReferenceError: Cannot access 'NINA_EMBEDDING_DIMENSIONS' before
 * initialization` at import time. It would not have fired today — `lib/db/schema.ts` happens to
 * list `./schema/nina/chat` above `./schema/nina/avatars`, and nothing outside this directory
 * imports a schema module directly — which is exactly what makes it worth removing rather than
 * documenting: correctness that depends on the order of two `export *` lines is a bomb with a
 * tidy-up as its trigger.
 *
 * A leaf module has no cycle to be caught in. Both sides import it, neither imports the other for
 * it, and `./avatars` re-exports the name so `@/lib/db/schema`'s surface is unchanged — which is
 * why this module is deliberately NOT a barrel entry of its own: one name, one export path, no
 * ambiguous star.
 */
export const NINA_EMBEDDING_DIMENSIONS = 1536
