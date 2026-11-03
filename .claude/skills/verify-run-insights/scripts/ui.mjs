// node ui.mjs <base-url> <steps.mjs> <evidence-dir> <cookie-value> <standin-url> <store-host> [width] [theme] [tag]
// Steps module: `export default async ({ page, base, shot, log, fixture, args }) => { ... }`.
//   args           the words after `--` on the verify.sh ui command line
//   shot(name)     viewport screenshot into evidence (fullPage: false; every screen is a phone column)
//   log(text)      line into the run's ui transcript
//   fixture(name)  absolute path of a file under the repo's research/fixtures/screenshots/shipped/
// Signed in as the run's runner (the cookie verify.sh minted). Records a video of the whole drive
// and a final screenshot, pass or fail. Fails on a page error, a console error, ending on the
// signed-out screen, or horizontal scroll.
//
// The browser's network is fenced like the server's: loopback passes, the run's fake Blob store
// (https://<store-host>/...) is served from the stand-in, and every other host is aborted and
// logged. Notifications are never granted, so no push subscription can be created.
// Run from the run's snapshot (resolves playwright from its node_modules).
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { appendFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'

const [
  base,
  stepsPath,
  evidence,
  cookie,
  standin,
  storeHost,
  width = '390',
  theme = 'dark',
  tagArg,
] = process.argv.slice(2)
if (!base || !stepsPath || !evidence || !cookie || !standin || !storeHost) {
  console.error(
    'usage: node ui.mjs <base> <steps.mjs> <evidence> <cookie> <standin> <store-host> [width] [theme] [tag]',
  )
  process.exit(2)
}

const require = createRequire(path.join(process.cwd(), 'package.json'))
const { chromium } = require('playwright')

const n = readdirSync(evidence).filter(
  (f) => /^\d\d-.*\.txt$/.test(f) && !f.startsWith('00-'),
).length
const tag = tagArg || `${String(n + 1).padStart(2, '0')}-ui-${path.basename(stepsPath, '.mjs')}`
const transcript = path.join(evidence, `${tag}.txt`)
const log = (text) => {
  appendFileSync(transcript, `${text}\n`)
  console.log(text)
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({
  viewport: { width: Number(width), height: 844 },
  colorScheme: theme === 'light' ? 'light' : 'dark',
  recordVideo: { dir: path.join(evidence, '.video'), size: { width: Number(width), height: 844 } },
  permissions: [],
})
await context.addCookies([
  {
    name: 'authjs.session-token',
    value: cookie,
    domain: new URL(base).hostname,
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  },
])

const blocked = new Set()
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url())
  if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
  if (url.hostname === storeHost) {
    const res = await fetch(`${standin}/files${url.pathname}`)
    return route.fulfill({
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: Buffer.from(await res.arrayBuffer()),
    })
  }
  if (!blocked.has(url.host)) {
    blocked.add(url.host)
    log(`egress BLOCKED (browser) ${route.request().method()} ${url.origin}`)
  }
  return route.abort('blockedbyclient')
})

// Next's dev-tools badge (<nextjs-portal>) exists only under `next dev` and sits over the bottom
// of the screen, where the tab bar is, swallowing clicks. Hide it; the app is untouched.
await context.addInitScript(() => {
  const hide = () => {
    const st = document.createElement('style')
    st.textContent = 'nextjs-portal { display: none !important; }'
    document.head.appendChild(st)
  }
  if (document.head) hide()
  else document.addEventListener('DOMContentLoaded', hide)
})
const page = await context.newPage()
page.setDefaultTimeout(30_000)
const problems = []
page.on('console', (m) => {
  if (m.type() !== 'error') return
  // The aborted off-allowlist requests above surface as console errors; they are logged as egress.
  if (/ERR_BLOCKED_BY_CLIENT/.test(m.text())) return
  problems.push(m.text())
  log(`console.error: ${m.text()}`)
})
page.on('pageerror', (e) => {
  problems.push(e.message)
  log(`pageerror: ${e.message}`)
})
let shots = 0
const shot = async (name) => {
  const file = path.join(evidence, `${tag}-${++shots}-${name}.png`)
  // caret: 'initial' -- the default hides the caret by injecting a style, which races hydration
  // and is reported as a hydration mismatch the app does not have.
  await page.screenshot({ path: file, caret: 'initial' })
  log(`screenshot: ${file}`)
}
const fixtureDir = path.join(process.cwd(), 'research/fixtures/screenshots/shipped')
const fixture = (name) => path.join(fixtureDir, name)

let failed = null
try {
  log(`steps: ${stepsPath}  (${width}px, ${theme})`)
  const { default: steps } = await import(pathToFileURL(stepsPath).href)
  await steps({
    page,
    base,
    shot,
    log,
    fixture,
    args: JSON.parse(process.env.RI_VERIFY_ARGS ?? '[]'),
  })
  const here = new URL(page.url())
  if (
    here.pathname === '/' &&
    (await page.getByRole('button', { name: /continue with google/i }).count()) > 0
  ) {
    throw new Error('ended on the signed-out screen: the session was rejected')
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0)
    throw new Error(`horizontal scroll: ${overflow}px wider than the ${width}px viewport`)
  if (problems.length) throw new Error(`${problems.length} console/page error(s)`)
  log('result: PASS')
} catch (err) {
  failed = err
  log(`result: FAIL ${err?.stack ?? err}`)
} finally {
  await shot(failed ? 'failure' : 'final').catch(() => {})
  const video = page.video()
  await context.close()
  await browser.close()
  if (video) {
    const file = path.join(evidence, `${tag}.webm`)
    renameSync(await video.path(), file)
    rmSync(path.join(evidence, '.video'), { recursive: true, force: true })
    log(`video: ${file}`)
  }
  console.error(`[evidence: ${transcript}]`)
}
process.exit(failed ? 1 : 0)
