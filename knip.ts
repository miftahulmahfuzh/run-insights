import type { KnipConfig } from 'knip'

/**
 * knip — the durable dead-export / unused-file detector (adopted 2026-09-12 by session
 * `tokenmax-dead-export-tooling`). Replaces the hand-rolled one-off grep sweeps every prior
 * YAGNI session wrote from scratch: `npm run knip` re-derives the whole census from the import
 * graph instead.
 *
 * Why AST and not grep: tests and comments NAME dead symbols in prose and string literals
 * (`'distillNinaMemory'` appears inside tests/admin.*.test.ts as data), so a text census
 * over-counts usage. knip resolves real import edges — the property the hand-rolled sweeps kept
 * re-attempting, with a different typo each time.
 *
 * Deliberate defaults kept:
 *   - `ignoreExportsUsedInFile: false` (knip's default) — an export used only inside its own
 *     file is still reported. That "needless export keyword" class is exactly what the
 *     lib-admin-dead-exports session hunted by hand; keep the noise, it is signal.
 *   - `includeEntryExports` off — Next route files export framework hooks (`generateMetadata`,
 *     route handlers); turning it on would flood the report with false positives.
 *
 * Entries knip finds on its own (verified against the first run): package.json scripts (every
 * scripts/*.mjs wired there), the Next.js plugin's file conventions (page/layout/route AND this
 * version's root `proxy.ts`), vitest tests via vitest.config.ts (tests/** plus co-located
 * *.test.ts), drizzle.config.ts, and the eslint/prettier/postcss configs.
 *
 * One documented false positive lives in the report BY DESIGN: `EXTRACTION_SHAPE`
 * (lib/llm/prompts/extraction.ts). `npm run probe:f04` reads it straight out of that module's
 * SOURCE TEXT by regex — deliberately, because the probe replays the job without a TS loader
 * (`@/` alias + `server-only`), so no import-graph tool can ever see that consumer. Do not
 * "fix" the flag by deleting the export: dropping `export` silently changes what the probe
 * scrapes while `tsc` stays green either way. Everything else reported is triaged backlog for
 * the next YAGNI session, not noise to suppress.
 */
const config: KnipConfig = {
  ignore: [
    // Deliberate scratch area — tsconfig excludes it too. Ignoring it here means a lib/ export
    // kept alive ONLY by a research script still shows up as unused, which is the right question
    // for a YAGNI sweep to surface: graduate the script to scripts/ (wired in package.json) or
    // let the export go.
    'research/**',
    // Design token sheet: a human- and doc-consumed source of truth (DESIGN_INTEGRATION.md,
    // design-brief.md, and gen-og-default.mjs mirror its values by hand). Nothing can import a
    // design reference, so "unused file" is the wrong verdict for it by construction.
    'docs/design/tokens.css',
  ],
}

export default config
