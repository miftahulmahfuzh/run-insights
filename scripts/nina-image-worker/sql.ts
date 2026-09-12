/**
 * The worker's SQL client: the `NeonSql` type every module shares, and `connectSql`, the one place
 * the client is built.
 *
 * `NeonSql` is `@neondatabase/serverless`'s tagged-template client, as much of it as this worker
 * uses. Written by hand rather than imported because the package's types are not reachable through
 * a `require()` under `--experimental-strip-types`.
 *
 * The package itself is CJS-friendly and is loaded the way every other script in `scripts/` loads
 * such a package (`scripts/blob-reap.mjs:34`), so this module needs no bundler and no transform
 * beyond stripping. The `require` runs at module load — importing this module smoke-tests the
 * install, exactly as the single-file worker's top-level shim did. `main` is the only caller of
 * `connectSql`.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import { createRequire } from 'node:module'

/**
 * `@neondatabase/serverless`'s tagged-template client, as much of it as this file uses. Written by
 * hand rather than imported because the package's types are not reachable through a `require()`
 * under `--experimental-strip-types`.
 */
export interface NeonSql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  transaction: (queries: unknown[]) => Promise<unknown[]>
}

const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless') as {
  neon: (url: string) => NeonSql
}

/** One client per URL; `main` builds exactly one and hands it to everything else. */
export function connectSql(url: string): NeonSql {
  return neon(url)
}
