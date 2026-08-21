/**
 * Copies `browser-image-compression`'s UMD bundle into `public/vendor/` so its Web Worker can
 * `importScripts()` it from our own origin.
 *
 * WHY THIS EXISTS. With `useWebWorker: true` the library spawns a worker that `importScripts()`
 * its own bundle, and its DEFAULT `libURL` is a **jsDelivr CDN URL**. That would put a third party
 * on the hot path of every screenshot the runner uploads: a runtime dependency on someone else's
 * uptime, a request that fails under any strict `script-src` CSP, and a cross-origin fetch on the
 * cellular connection the 560w/q80 recipe exists to spend as little of as possible.
 * `lib/extract/constants.ts`'s `COMPRESSION_LIB_URL` points at the copy this script makes.
 *
 * Runs from `predev` and `prebuild`, so the file is never missing in a fresh clone or on Vercel.
 * `public/vendor/` is gitignored: it is a build artefact of `node_modules`, and committing it
 * would mean a stale copy quietly surviving a dependency bump.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

// The UMD build, not the .mjs one: `importScripts()` cannot load an ES module.
const src = require.resolve('browser-image-compression/dist/browser-image-compression.js')
const destDir = path.resolve('public/vendor')
const dest = path.join(destDir, 'browser-image-compression.js')

await mkdir(destDir, { recursive: true })
await copyFile(src, dest)

console.log(
  `[f04] ${path.relative(process.cwd(), src)} -> public/vendor/browser-image-compression.js`,
)
