import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must come last: disables stylistic rules that conflict with Prettier.
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'drizzle/**',
    'next-env.d.ts',
    'scaffold-tmp/**',
    'research/**', // plain feasibility scripts, not part of the app's lint surface
    // A verbatim copy of browser-image-compression's UMD bundle, made on predev/prebuild by
    // scripts/copy-image-compression-worker.mjs so the compression worker loads from our own
    // origin instead of a CDN (F04 §3). It is minified third-party output, gitignored, and
    // regenerated on every build — linting it produced 222 warnings about someone else's code.
    'public/vendor/**',
  ]),
])

export default eslintConfig
