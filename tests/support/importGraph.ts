import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

/**
 * A static, textual import-graph walker over this repo's own `.ts`/`.tsx` files.
 *
 * ── WHY A TEXT SCAN AND NOT `import()` ────────────────────────────────────────────────────────
 * Because the question is *"can this module reach that one?"*, not *"what happens when it runs?"*.
 * Actually importing `app/s/[token]/page.tsx` under Vitest would need the whole Next server runtime,
 * a database client, and `server-only` resolution — and it would prove the graph only for the
 * branches that executed. A text scan proves it for every branch, including the one a future edit
 * adds inside an `if` nobody runs in a test.
 *
 * ── WHAT IT DELIBERATELY IGNORES ──────────────────────────────────────────────────────────────
 *   - **`import type` and `export type`**, because they erase at compile time and are therefore not
 *     edges in the runtime graph. This is not a convenience: `lib/share/types.ts` imports
 *     `HrMaxSource` from `lib/metrics/hrMax.ts` as a type precisely so the public page can name the
 *     union without being able to call the resolver. Counting that as an edge would fail the one
 *     assertion this file exists to make, and the "fix" would be to duplicate a contract.
 *   - Bare specifiers (`react`, `next/navigation`, `@vercel/blob`). Third-party packages are not
 *     what these assertions are about, and following them would walk `node_modules`.
 *   - `next/dynamic` string arguments are NOT ignored: `dynamic(() => import('./XInner'))` is a real
 *     edge and is followed, because a lazily-loaded chunk still ships to the browser.
 *
 * Paths in and out are repo-relative with forward slashes, so an assertion reads the same on any
 * platform.
 *
 * The clause between `import` and `from` is matched as `[^;]*?` rather than `[\s\S]*?` so it can
 * span the newlines of a multi-line named import — this repo has plenty — without a bare
 * `export function foo()` being able to run on and swallow the `from` of a *later* statement, which
 * would invent an edge that does not exist and fail an assertion for the wrong reason.
 */
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?!type[\s{])(?:[^;]*?\sfrom\s+)?['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx']

function toPosix(path: string): string {
  return path.split('\\').join('/')
}

/** Resolve a specifier the way the bundler would: `@/` on the repo root, `./` on the importer. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = resolve(repoRoot, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(repoRoot, dirname(fromFile), specifier)
  else return null // a package, not one of ours

  for (const ext of ['', ...EXTENSIONS]) {
    const candidate = base + ext
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      try {
        if (readFileSync(candidate)) return toPosix(relative(repoRoot, candidate))
      } catch {
        /* a directory — fall through to the index lookup below */
      }
    }
  }
  for (const ext of EXTENSIONS) {
    const candidate = join(base, `index${ext}`)
    if (existsSync(candidate)) return toPosix(relative(repoRoot, candidate))
  }
  return null
}

/**
 * Every first-party module reachable from `entry`, transitively, including `entry` itself.
 *
 * @param entry repo-relative path, e.g. `'app/s/[token]/page.tsx'`
 */
export function importGraph(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [toPosix(entry)]

  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    let source: string
    try {
      source = readFileSync(resolve(repoRoot, file), 'utf8')
    } catch {
      continue
    }

    for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
      re.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = re.exec(source)) !== null) {
        const resolved = resolveSpecifier(match[1]!, file)
        if (resolved && !seen.has(resolved)) queue.push(resolved)
      }
    }
  }

  return seen
}

/** True when the module opts into the client graph. */
export function isClientModule(file: string): boolean {
  try {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    return /^\s*(['"])use client\1/m.test(source)
  } catch {
    return false
  }
}

export function readRepoFile(file: string): string {
  return readFileSync(resolve(repoRoot, file), 'utf8')
}

/**
 * Source with block and line comments removed.
 *
 * Necessary because this repo's modules explain themselves at length, and an assertion like "the
 * page must not contain the string `generateStaticParams`" otherwise fires on the very paragraph
 * that says why `generateStaticParams` is absent. Same approximation, and the same justification, as
 * `scripts/check-f08-boundaries.mjs`: it can produce a false PASS on a line that no longer looks
 * like code, which is acceptable — a guard that fires on its own explanation gets silenced, and then
 * it protects nothing.
 */
export function readRepoCode(file: string): string {
  return readRepoFile(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

export function repoFileExists(file: string): boolean {
  return existsSync(resolve(repoRoot, file))
}
