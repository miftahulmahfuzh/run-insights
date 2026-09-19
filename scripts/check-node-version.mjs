// Fails fast, with a readable message, when the running Node is below package.json's
// `engines.node`. Without this, vitest 4's `rolldown` dependency crashes deep inside its own
// module graph — before vitest.config.ts or any setup file even loads — because rolldown imports
// `styleText` from `node:util`, which Node only ships from 20.12/21.7 onward. On a plain Node 20.11
// that surfaces as an opaque `SyntaxError: The requested module 'node:util' does not provide an
// export named 'styleText'` inside node_modules, with nothing pointing at the actual cause.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
const { engines } = JSON.parse(readFileSync(pkgPath, 'utf8'))
const required = engines?.node?.match(/(\d+)/)?.[1]
const actual = process.versions.node.split('.')[0]

if (required && Number(actual) < Number(required)) {
  console.error(
    `FAIL  Node ${process.versions.node} is running this script, but package.json requires ` +
      `engines.node ${engines.node} (CI runs Node 22 — see .github/workflows/ci.yml).\n` +
      `      vitest's rolldown dependency needs node:util's styleText (Node >=20.12/21.7) and ` +
      `will otherwise crash with an unrelated-looking SyntaxError.\n` +
      `      Switch to a Node ${required}+ install before re-running, e.g.:\n` +
      `        nvm use 22   # or fnm use / asdf shell / point PATH at a Node ${required}+ binary`,
  )
  process.exit(1)
}
