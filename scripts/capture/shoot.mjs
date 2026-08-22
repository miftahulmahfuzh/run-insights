/**
 * F19 — drive the real app and photograph it.
 *
 *   node --env-file=.env.local scripts/capture/shoot.mjs [--commit] [--stills] [--gifs]
 *                                                       [--only 03-review-banner,review]
 *                                                       [--origin http://localhost:3210]
 *
 * With no pass flags it runs all three. The dev server must already be up, and
 * `scripts/capture/seed-demo.mjs` must already have run.
 *
 * `--only` narrows a pass to named artifacts — see ARTIFACTS below. It is what makes a one-file
 * re-shoot possible: F21 needed exactly `03-review-banner`, `04-review-split` and `review` after a
 * copy fix changed one line of the sticky bar, and running the full passes to get them would have
 * churned fifteen files and spent a real vision call on the hero.
 *
 * PASS 1 — COMMIT. Opens each seeded extraction at `/x/<id>` and clicks **Confirm & save**.
 * This is the pass that makes the data real: `commitReviewAction` validates the draft, writes the
 * run with its splits and zones in one batch, appends the corrections log and fires
 * `onRunCommitted`, which recomputes the ten personal records and evaluates all twenty-two badge
 * rules. Nothing in this file computes a metric, and nothing in the seed writes one.
 *
 * It only works because every seeded payload leaves the consistency banner green, which is
 * `tests/capture/dataset.test.ts`'s job to keep true. When that test is red this pass stalls on
 * the first run rather than producing 25 subtly wrong screenshots.
 *
 * PASS 2 — STILLS. Viewport-sized PNGs at a phone's dimensions, not `fullPage`. Every screen in
 * this app is `max-w-[470px]`, so 390x844 is the shape it was designed in; a full-page capture of
 * `/trends` is 4,000 px tall and reads as a diagram of a website rather than a photograph of an
 * app.
 *
 * PASS 3 — GIFS. Playwright records webm; `webm-to-gif.mjs` does the two-pass palette.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { countRuns, MANIFEST_PATH, resetHeroUpload } from './seed-demo.mjs'
import { mintSessionCookie } from './session-cookie.mjs'
import { toGif } from './webm-to-gif.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const MEDIA = path.join(REPO, 'docs/media')
const VIDEO_DIR = path.join(HERE, '.video')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const ORIGIN = arg('origin', 'http://localhost:3210')
/** The hero recording costs a real vision call, so keep its webm when tuning the encoder. */
const KEEP_VIDEO = process.argv.includes('--keep-video')

/*
 * PASS ORDER IS LOAD-BEARING, and one of these dependencies cost a whole GIF.
 *
 *   commit  writes the 25 runs.
 *   hero    uploads a 26th for real — dated a day after anything the seed writes.
 *   warm    generates the week and month prose. It MUST come after `hero`, because the hero's run
 *           lands inside the current ISO week and changes its facts. `insights` is keyed by a hash
 *           of those facts, so a week insight generated before the hero is stale the moment the
 *           hero commits, and `/trends` renders the regenerating state instead of the prose. The
 *           first attempt at this order produced a 22-second trends GIF of a card reading
 *           "Rendering…".
 *   stills  and gifs then read from a warm cache.
 */
const ALL_PASSES = ['commit', 'hero', 'warm', 'stills', 'gifs']
const passes = ALL_PASSES.filter((p) => process.argv.includes(`--${p}`))
const RUN = passes.length > 0 ? new Set(passes) : new Set(ALL_PASSES)

/**
 * Every artifact this file can produce, by the name it lands under in `docs/media/`.
 *
 * This list exists so `--only` can refuse a typo. A filter that silently matches nothing is the
 * single most dangerous thing to add to this harness: every finding in F19's retrospective is a
 * variant of "it wrote the files and reported success and the files were wrong", and a selective
 * flag is a brand new way to manufacture exactly that.
 */
const ARTIFACTS = [
  '01-runs',
  '02-upload',
  '03-review-banner',
  '04-review-split',
  '05-run-detail',
  '06-insight',
  '07-run-chart',
  '08-run-splits',
  '09-trends',
  '10-trends-chart',
  '11-badges',
  '12-share',
  'hero',
  'review',
  'trends',
]

const only = arg('only', null)
const ONLY = only
  ? new Set(
      only
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean),
    )
  : null

if (ONLY) {
  const unknown = [...ONLY].filter((n) => !ARTIFACTS.includes(n))
  if (unknown.length > 0) {
    console.error(
      `FAIL  --only names nothing this harness produces: ${unknown.join(', ')}\n` +
        `      known artifacts: ${ARTIFACTS.join(', ')}`,
    )
    process.exit(2)
  }
}

/** Is this artifact wanted? Everything is, unless `--only` says otherwise. */
const wants = (name) => ONLY === null || ONLY.has(name)

/**
 * Is ANY of these wanted? Used to skip whole segments of the stills pass.
 *
 * Not merely a saving. The `05`-`08` segment reads run cards off `/` and THROWS
 * `expected at least 2 runs on /` when the dataset has not been committed — so guarding the segment
 * is what lets the review stills be taken against a seed-only database, with no commit pass, no
 * hero and no warm.
 */
const wantsAny = (...names) => names.some(wants)

/** What actually got written, so the run can be held to what was asked of it. */
const produced = new Set()

/**
 * The phone. `deviceScaleFactor: 2` because a 1x PNG of a 390 px screen looks soft the moment
 * GitHub scales it, and `colorScheme: 'dark'` because F19-D3 picked one theme and the badge patches
 * were drawn on a navy substrate.
 */
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
  timezoneId: 'Asia/Jakarta',
  locale: 'en-GB',
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
const log = (message) => console.log(message)

/* ============================================================================
 * Chrome
 * ==========================================================================*/

async function newContext(browser, { withCookie = true, recordVideo = false } = {}) {
  const context = await browser.newContext({
    ...PHONE,
    baseURL: ORIGIN,
    ...(recordVideo ? { recordVideo: { dir: VIDEO_DIR, size: PHONE.viewport } } : {}),
  })
  if (withCookie) {
    const cookie = await mintSessionCookie({
      userId: manifest.userId,
      name: 'Demo Runner',
      email: `${manifest.userId}@demo.invalid`,
      origin: ORIGIN,
    })
    await context.addCookies([{ name: cookie.name, value: cookie.value, url: ORIGIN }])
  }
  return context
}

/** Charts are lazily-loaded client components; a screenshot taken too early catches the skeleton. */
async function settle(page, { charts = false } = {}) {
  await page.waitForLoadState('networkidle').catch(() => {})
  if (charts) {
    await page
      .waitForSelector('svg.recharts-surface', { timeout: 15_000 })
      .catch(() => log('    (no recharts surface found — check the selector)'))
  }
  await page.waitForTimeout(900)
}

/**
 * F07's insight card fills in from a client effect, not from the first render: generating one is a
 * 10-35 s model call, and `InsightTrigger` exists precisely so the page does not block on it. A
 * screenshot taken on arrival therefore catches the honest-but-empty card, which is a picture of
 * the loading state rather than of the feature.
 *
 * The card reserves `min-h-[168px]`, and that literal class is the only stable handle on it — so
 * this waits for that box to actually hold prose rather than for a spinner that was deliberately
 * never built.
 */
async function waitForInsight(page, timeout = 90_000) {
  const filled = await page
    .waitForFunction(
      () => {
        const card = document.querySelector('[class*="min-h-[168px]"]')
        return card != null && (card.textContent ?? '').trim().length > 90
      },
      { timeout },
    )
    .then(() => true)
    .catch(() => false)
  if (!filled) log('    (no insight prose arrived — capturing the card as it stands)')
  await page.waitForTimeout(700)
  return filled
}

async function shot(page, name, options = {}) {
  if (!wants(name)) return
  const file = path.join(MEDIA, `${name}.png`)
  await page.screenshot({ path: file, ...options })
  produced.add(name)
  log(`    ${path.relative(REPO, file)}`)
}

/* ============================================================================
 * Pass 1 — commit every seeded extraction through the real review screen
 * ==========================================================================*/

async function commitAll(context) {
  const page = await context.newPage()

  // Fail in two seconds rather than twenty-five commits later.
  await page.goto('/me')
  const signedIn = await page.getByText('Demo Runner').count()
  if (signedIn === 0) {
    throw new Error(
      'not signed in — the minted cookie was rejected. Check AUTH_SECRET and the origin scheme.',
    )
  }

  let committed = 0
  for (const [i, run] of manifest.runs.entries()) {
    await page.goto(`/x/${run.extractionId}`)

    // Already committed on an earlier attempt: /x redirects to the run. Idempotent by design.
    if (new URL(page.url()).pathname.startsWith('/r/')) {
      committed++
      process.stdout.write('=')
      continue
    }

    const confirm = page.getByRole('button', { name: 'Confirm & save' })
    await confirm.waitFor({ timeout: 15_000 })
    await confirm.click()
    try {
      await page.waitForURL(/\/r\/[^/]+$/, { timeout: 30_000 })
      committed++
      process.stdout.write('.')
    } catch {
      const banner = await page.locator('body').innerText()
      throw new Error(
        `run ${i + 1} (${run.date}, ${run.km} km) did not commit. The screen says:\n` +
          banner.slice(0, 700),
      )
    }
  }
  log(`\n    committed ${committed}/${manifest.runs.length}`)
  await page.close()
  return committed
}

/* ============================================================================
 * Pass 1b — warm the insights
 *
 * Week and month prose comes from the nightly cron; session prose comes from viewing the run. Both
 * are cached in `insights` and keyed by a hash of the facts, so warming them once means the stills
 * pass renders from cache instead of photographing three loading states in a row.
 * ==========================================================================*/

async function warm(context) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    /*
     * RETRIED, and the reason is measured. The commit pass fires ~20 narrative calls in about a
     * minute — every commit redirects to `/r/<id>`, where `InsightTrigger` generates that run's
     * prose — and the vendor throttles under that burst. `getOrCreateInsight` handles a throttled
     * call the way R-17 requires, by returning a null payload rather than throwing, so the cron
     * answers a cheerful `{"generated":0,"failed":0}` and the only visible symptom is a `/trends`
     * screenshot with an empty card on it. One retry twenty seconds later produced both scopes.
     */
    for (let attempt = 1; attempt <= 4; attempt++) {
      log(`  GET /api/cron/rollup — week and month scopes (attempt ${attempt})`)
      const res = await fetch(`${ORIGIN}/api/cron/rollup`, {
        headers: { authorization: `Bearer ${secret}` },
      })
      const body = await res.text()
      log(`    ${res.status} ${body.slice(0, 240)}`)
      if (res.ok && !/"generated":0\b/.test(body)) break
      if (attempt < 4) await new Promise((r) => setTimeout(r, 20_000))
      else log('    WARN  week/month prose never generated — /trends will show empty cards')
    }
  } else {
    log('  CRON_SECRET not set — skipping the week/month warm-up')
  }

  const page = await context.newPage()
  await page.goto('/')
  await settle(page)
  const hrefs = await page
    .locator('a[href^="/r/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')).filter(Boolean))
  /* Only the two runs the stills and the GIFs actually visit. Warming all 25 would be 25 model
   * calls for 23 screenshots nobody takes. */
  for (const href of [...new Set(hrefs)].slice(0, 2)) {
    log(`  ${href} — session scope`)
    await page.goto(href)
    await settle(page, { charts: true })
    await waitForInsight(page)
  }
  await page.close()
}

/* ============================================================================
 * Pass 2 — the stills
 * ==========================================================================*/

/**
 * Scroll a subject into view and photograph it there.
 *
 * By selector, never by pixel offset. A fixed `scrollBy(0, 700)` is a promise about how tall the
 * insight card is, and that card's height is model output — it was three paragraphs on the first
 * capture run and five on the second, which silently turned "the pace/HR chart" into "the middle of
 * a paragraph". `scrollIntoView` asks the page where the thing is.
 */
async function shotOf(page, name, selector, { block = 'center' } = {}) {
  const found = await page.evaluate(
    ([sel, blk]) => {
      const el = document.querySelector(sel)
      if (!el) return false
      el.scrollIntoView({ block: blk })
      return true
    },
    [selector, block],
  )
  if (!found) {
    log(`    SKIPPED ${name} — nothing matched ${selector}`)
    return false
  }
  await page.waitForTimeout(650)
  await shot(page, name)
  return true
}

async function stills(context, browser) {
  const page = await context.newPage()

  if (wants('01-runs')) {
    log('  / — the runs list')
    await page.goto('/')
    await settle(page)
    await shot(page, '01-runs')
  }

  if (wants('02-upload')) {
    log('  /upload — the picker')
    await page.goto('/upload')
    await settle(page)
    await shot(page, '02-upload')
  }

  /*
   * THE REVIEW STILLS, and they are the cheapest two in the set.
   *
   * They read `manifest.flagged.extractionId` — the canonical fixture with its real misread
   * injected — and the seed deliberately leaves that row UNCOMMITTED, which is the whole reason
   * there is a review screen to photograph at all. So this segment needs a seed and a dev server
   * and nothing else: no commit pass, no hero, no warm insights, no model call.
   */
  if (wantsAny('03-review-banner', '04-review-split')) {
    log('  /x — review: the banner, and the row it points at')
    await page.goto(`/x/${manifest.flagged.extractionId}`)
    await settle(page)
    await shot(page, '03-review-banner')
    /* The banner names the problem at the top of a screen whose splits table is ten scrolls down.
     * Both halves are the feature — the claim and the row it localises to — so both are captured. */
    await seek(page, () =>
      [...document.querySelectorAll('td, th, div, span')].find(
        (el) => el.childElementCount === 0 && el.textContent?.trim() === '7',
      ),
    )
    await shot(page, '04-review-split')
  }

  /*
   * EVERYTHING BELOW NEEDS A COMMITTED DATASET.
   *
   * The block reads run cards off `/` and throws when there are fewer than two, so it is not
   * skipped here as a saving — it is skipped so that `--only 03-review-banner,04-review-split` can
   * run against a database that has only been seeded.
   */
  if (wantsAny('05-run-detail', '06-insight', '07-run-chart', '08-run-splits')) {
    await page.goto('/')
    await settle(page)
    /*
     * Runs are chosen by DISTANCE, never by position in the list.
     *
     * The first version took `[0]` and `[1]` and assumed they were the 21 km long run and a typical
     * 10 km. That held until the hero recording committed its own upload, which is dated a day later
     * than anything the seed writes — so it became run [0], everything shifted by one, and the frames
     * labelled "a typical 10 km" were silently taken on the 21 km run instead. Reading the distance
     * off each card costs one evaluate and cannot drift.
     */
    const runs = await page.locator('a[href^="/r/"]').evaluateAll((els) =>
      els
        .map((el) => ({
          href: el.getAttribute('href'),
          km: Number(/([\d.]+)\s*km/.exec(el.textContent ?? '')?.[1] ?? NaN),
        }))
        .filter((r) => r.href && Number.isFinite(r.km)),
    )
    if (runs.length < 2) throw new Error(`expected at least 2 runs on /, found ${runs.length}`)
    const longest = runs.reduce((a, b) => (b.km > a.km ? b : a))
    /* The modal shape in this dataset, and the one the fixture measured. */
    const typical = runs
      .filter((r) => r.href !== longest.href)
      .reduce((a, b) => (Math.abs(b.km - 10.5) < Math.abs(a.km - 10.5) ? b : a))
    const runHrefs = [longest.href, typical.href]
    log(`    longest ${longest.km} km · typical ${typical.km} km`)

    /*
     * TWO run pages, not one, and the split is deliberate.
     *
     * The newest run is the 21.2 km long one: the richest insight in the set, a personal record and
     * the widest zone spread, so it carries the header and the prose. But it has 22 split rows, and
     * 22 x-axis ticks inside a 390 px chart overprint into an unreadable smear — a real rendering
     * limit at long distances, not something to photograph as though it were the normal case.
     *
     * So the chart and the splits table come from the second run instead, a 10.9 km one with eleven
     * rows. That is also the modal run in this dataset and the shape the fixture measured, so it is
     * the honest thing to show a visitor rather than the flattering one.
     */
    log(`  ${runHrefs[0]} — run detail and its insight (the longest run)`)
    await page.goto(runHrefs[0])
    await settle(page, { charts: true })
    await waitForInsight(page)
    await shot(page, '05-run-detail')

    log('    the insight card')
    await seek(page, () => document.querySelector('[class*="min-h-[168px]"]'))
    await shot(page, '06-insight')

    log(`  ${runHrefs[1]} — the chart and the splits (a typical run)`)
    await page.goto(runHrefs[1])
    await settle(page, { charts: true })
    await waitForInsight(page)

    log('    the pace/HR chart — the one sanctioned dual axis')
    await seek(page, () => document.querySelector('svg.recharts-surface'))
    await shot(page, '07-run-chart')

    /*
     * The SPLITS card, found by its own eyebrow rather than by `querySelector('table')`.
     *
     * `table` matches the wrong one: `ChartFrame` renders every chart's table twin — the accessible
     * text version of the same numbers, which is why F08 can ship a chart at all — and that table
     * sits directly beneath the chart. Seeking it produced a frame byte-identical to the chart's.
     */
    log('    the splits card under it')
    /* FIRST match, not last: the share panel further down has its own row labelled "Splits" (the
     * screenshot kind), and `.pop()` scrolled past the table to the share controls. */
    await seek(page, () =>
      [...document.querySelectorAll('*')].find(
        (el) => el.childElementCount === 0 && el.textContent?.trim() === 'Splits',
      ),
    )
    await shot(page, '08-run-splits')
  }

  if (wantsAny('09-trends', '10-trends-chart')) {
    log('  /trends')
    await page.goto('/trends')
    await settle(page, { charts: true })
    await shot(page, '09-trends')
    await seek(page, () => document.querySelector('svg.recharts-surface'))
    await shot(page, '10-trends-chart')
  }

  if (wants('11-badges')) {
    log('  /me — the badge shelf')
    await page.goto('/me')
    await settle(page)
    await seek(page, () => document.querySelector('img[src*="/badges/"]'))
    await shot(page, '11-badges')
  }

  await page.close()

  /*
   * The share page, in a context with NO cookie.
   *
   * Its entire claim is that it renders for someone with no account. A screenshot taken while
   * signed in does not test that claim, it merely fails to contradict it — and the signed-out page
   * is a visibly different screen: no tab bar, its own header, and only the photos the runner left
   * included.
   */
  if (wants('12-share')) {
    log('  /s/<token> — the public page, signed out')
    /* `createShareToken` drives a real run page, so this too needs the committed dataset. */
    const token = await createShareToken(context)
    if (token) {
      const anon = await newContext(browser, { withCookie: false })
      const anonPage = await anon.newPage()
      await anonPage.goto(`/s/${token}`)
      await settle(anonPage, { charts: true })
      await anonPage.screenshot({ path: path.join(MEDIA, '12-share.png') })
      produced.add('12-share')
      log('    docs/media/12-share.png')
      await anon.close()
    } else {
      log('    SKIPPED — no share link could be created')
    }
  }

  assertNoDuplicateStills()
}

/**
 * No two stills may be byte-identical.
 *
 * This exists because two of them were. `07-run-chart` and `08-run-splits` came out as the same
 * 133,254 bytes, because the selector meant to find the splits table found the chart's own table
 * twin instead and the page never scrolled. Nothing about the run said so — twelve files were
 * written, twelve paths were logged, and the only symptom was a README with the same picture twice.
 *
 * A hash comparison is the whole check. It cannot tell a badly framed screenshot from a good one,
 * but it can tell that a frame this harness thinks it moved did not move.
 */
function assertNoDuplicateStills() {
  const seen = new Map()
  for (const file of readdirSync(MEDIA)
    .filter((f) => f.endsWith('.png'))
    .sort()) {
    const digest = createHash('sha256')
      .update(readFileSync(path.join(MEDIA, file)))
      .digest('hex')
    const twin = seen.get(digest)
    if (twin) {
      throw new Error(
        `${file} is byte-identical to ${twin} — one of their seeks did not move the page.`,
      )
    }
    seen.set(digest, file)
  }
  log(`    ${seen.size} stills, all distinct`)
}

/**
 * `--only` must produce everything it named.
 *
 * Without this, `--only review --stills` — a plausible mistake, a GIF's name handed to the stills
 * pass — writes nothing at all and prints `OK docs/media/ is up to date`. So does `--only 11-badges
 * --gifs`, and so does any name that is spelled right but unreachable from the passes requested.
 *
 * That is the same failure `assertNoDuplicateStills` exists for, arriving by a different route: the
 * harness reporting success for work it did not do. A selective flag is a new way to manufacture it,
 * so it ships with the check rather than acquiring one after the first time it lies.
 */
function assertProducedWhatWasAsked() {
  if (ONLY === null) return
  const missing = [...ONLY].filter((name) => !produced.has(name))
  if (missing.length > 0) {
    throw new Error(
      `--only asked for ${missing.join(', ')} and no pass produced ${missing.length === 1 ? 'it' : 'them'}. ` +
        `Stills need --stills; hero needs --hero; review and trends need --gifs.`,
    )
  }
  log(`    --only: ${produced.size} of ${ONLY.size} written — ${[...produced].sort().join(', ')}`)
}

/**
 * Scroll a thing into the middle of the viewport and let it settle.
 *
 * Every still except the four full-screen ones is framed this way rather than by a pixel offset.
 * An offset is a guess about a layout that changes whenever the prose above it does — and the
 * prose here is model output, so its height is not even stable between two capture runs of the
 * same data. Seeking the element means the chart is in frame because it is the chart.
 */
/**
 * Scroll the page by `dy`, on whatever element is actually scrolling.
 *
 * `window.scrollBy` does nothing here: the shell puts the scroll on an inner element, so the window
 * is not the scroller and the call succeeds while moving nothing. That is why the first trends
 * recording was 22 seconds of a stationary page — `scrollIntoView` (which walks up to the real
 * scroller itself) worked for the stills, and hid the problem until a GIF needed it.
 */
async function step(page, dy) {
  await page.evaluate((amount) => {
    const scroller =
      [...document.querySelectorAll('*')].find(
        (el) =>
          el.scrollHeight > el.clientHeight + 40 &&
          /auto|scroll/.test(getComputedStyle(el).overflowY),
      ) ?? document.scrollingElement
    scroller.scrollBy({ top: amount })
  }, dy)
}

async function seek(page, locate) {
  const found = await page.evaluate((fn) => {
    // eslint-disable-next-line no-new-func
    const el = new Function(`return (${fn})()`)()
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    return true
  }, locate.toString())
  if (!found) log('    (nothing matched — capturing wherever the page is)')
  await page.waitForTimeout(650)
  return found
}

/**
 * F11's share flow, driven rather than inserted: the token has to come from `createShare` for the
 * page to exist, and clicking the control is the only caller.
 */
async function createShareToken(context) {
  const page = await context.newPage()
  await page.goto('/')
  await settle(page)
  const href = await page.locator('a[href^="/r/"]').first().getAttribute('href')
  await page.goto(href)
  await settle(page)

  const share = page.getByRole('button', { name: /share/i }).first()
  if ((await share.count()) === 0) {
    await page.close()
    return null
  }
  await share.click()
  await page.waitForTimeout(1500)

  const link = await page
    .locator('input[value*="/s/"], a[href*="/s/"], code')
    .first()
    .evaluate((el) => el.value ?? el.href ?? el.textContent)
    .catch(() => null)
  await page.close()

  const match = /\/s\/([A-Za-z0-9_-]{16})/.exec(link ?? '')
  return match?.[1] ?? null
}

/* ============================================================================
 * Pass 3 — the GIFs
 * ==========================================================================*/

async function hero(browser) {
  rmSync(VIDEO_DIR, { recursive: true, force: true })
  mkdirSync(VIDEO_DIR, { recursive: true })

  /*
   * THE HERO. A real upload of the three canonical screenshots, through the real pipeline: browser
   * compression to the 560w/q80 recipe, a real Blob PUT, a real `glm-4.6v` call, a real review
   * screen, a real commit. It costs about $0.006 and takes 33-38 s, and it is the only recording
   * here that shows what the product actually is.
   *
   * The wait is REAL and is then timelapsed by `--speed`, never cut. Cutting it would imply the
   * model answers instantly; the README's caption states the measured latency next to the GIF.
   */
  /* Clear the previous hero run first — see `resetHeroUpload` for why R-5 makes this necessary. */
  const cleared = await resetHeroUpload(manifest.userId, [
    ...manifest.runs.map((r) => r.extractionId),
    manifest.flagged.extractionId,
  ])
  if (cleared.extractions > 0) {
    log(
      `  cleared ${cleared.extractions} previous hero upload(s): ` +
        `${cleared.runs} run(s), ${cleared.blobs} blob(s)`,
    )
  }

  await record(
    browser,
    'hero',
    async (page) => {
      await page.goto('/upload')
      await settle(page)
      await page.waitForTimeout(1200)
      await page.setInputFiles('input[type=file]', [
        path.join(REPO, 'research/fixtures/screenshots/1.png'),
        path.join(REPO, 'research/fixtures/screenshots/2.png'),
        path.join(REPO, 'research/fixtures/screenshots/3.png'),
      ])
      await page.waitForTimeout(2000)

      const submit = page.getByRole('button', { name: /extract|upload|read/i }).first()
      if (await submit.count()) await submit.click()

      /* The progress screen, then the review screen it refreshes into. 90 s is F04's own
       * STALE_PENDING_MS — past that the row self-heals to `failed` and there is nothing to wait
       * for. */
      await page.waitForURL(/\/x\/[^/]+$/, { timeout: 30_000 }).catch(() => {})
      const confirm = page.getByRole('button', { name: 'Confirm & save' })
      await confirm.waitFor({ timeout: 95_000 })
      await page.waitForTimeout(1500)
      for (let i = 0; i < 4; i++) {
        await step(page, 200)
        await page.waitForTimeout(280)
      }
      await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 0 }))
      await page.waitForTimeout(600)
      await confirm.click()
      await page.waitForURL(/\/r\/[^/]+$/, { timeout: 30_000 }).catch(() => {})
      await settle(page, { charts: true })
      await page.waitForTimeout(1600)
    },
    { speed: 8 },
  )

  /*
   * WAIT FOR THE COMMIT TO LAND BEFORE RETURNING, and this is not belt-and-braces.
   *
   * The click that commits the hero's run is a Server Action, and the recording stops as soon as
   * its own timers run out — the `waitForURL` above is deliberately forgiving so a slow commit
   * cannot destroy a recording that already has everything worth showing. The consequence is that
   * the commit can land *after* this pass returns.
   *
   * That is not cosmetic. The hero's run falls inside the current ISO week, so it changes the
   * week's facts, and `insights` is keyed by a hash of those facts. If `warm` runs before the
   * commit lands, it caches prose for the old facts, and `/trends` then renders a stale card while
   * regenerating — which is exactly what the first pass produced: a header reading 47.87 km above
   * prose reading "3 runs, 37.2 km". The stills disagreed with the GIFs for the same reason.
   *
   * So the pass ends when the database says so.
   */
  const target = manifest.runs.length + 1
  for (let i = 0; i < 30; i++) {
    if ((await countRuns(manifest.userId)) >= target) {
      log(`    commit landed — ${target} runs`)
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  log(`    WARN  the hero's commit never landed; downstream passes may see ${target - 1} runs`)
}

async function gifs(browser) {
  rmSync(VIDEO_DIR, { recursive: true, force: true })
  mkdirSync(VIDEO_DIR, { recursive: true })

  await record(browser, 'review', async (page) => {
    /* The review flow on the flagged run: the banner fires, it names the row, the row is fixed,
     * the banner clears. This is F05's whole argument in twelve seconds. */
    await page.goto(`/x/${manifest.flagged.extractionId}`)
    await settle(page)
    await page.waitForTimeout(1800)
    for (let i = 0; i < 7; i++) {
      await step(page, 210)
      await page.waitForTimeout(320)
    }
    await page.waitForTimeout(1200)
  })

  await record(browser, 'trends', async (page) => {
    await page.goto('/trends')
    await settle(page, { charts: true })
    await page.waitForTimeout(1200)
    for (let i = 0; i < 14; i++) {
      await step(page, 170)
      await page.waitForTimeout(260)
    }
    await page.waitForTimeout(1000)
  })

  /*
   * A fourth recording of the runs list and a run page was made and then dropped. It came out at
   * 2.0 MB, which took `docs/media/` to 8.4 MB against the 8 MB ceiling this feature set itself —
   * and it showed nothing that `01-runs.png`, `05-run-detail.png` and the hero do not already show.
   * Raising the budget to keep it would have been the wrong way round.
   */
}

async function record(browser, name, body, options = {}) {
  /* Before the context, deliberately: a skipped GIF must cost zero seconds, not twelve of driving
   * the page plus a two-pass encode that is then thrown away. */
  if (!wants(name)) return
  log(`  recording ${name}`)
  const context = await newContext(browser, { recordVideo: true })
  const page = await context.newPage()
  await body(page)
  const video = page.video()
  await page.close()
  await context.close()
  const webm = await video.path()
  const out = path.join(MEDIA, `${name}.gif`)
  if (KEEP_VIDEO) {
    const kept = path.join(HERE, `.${name}.webm`)
    copyFileSync(webm, kept)
    log(`    kept ${path.relative(REPO, kept)} — re-encode without re-recording`)
  }
  await toGif(webm, out, options)
  /* After the encode, not before: `toGif` fails loudly on a GIF it cannot bring inside budget, and
   * `produced` has to mean written rather than attempted. */
  produced.add(name)
}

/* ============================================================================
 * main
 * ==========================================================================*/

mkdirSync(MEDIA, { recursive: true })
if (!existsSync(MANIFEST_PATH)) {
  console.error('FAIL  no manifest. Run scripts/capture/seed-demo.mjs first.')
  process.exit(2)
}

const browser = await chromium.launch()
try {
  if (RUN.has('commit')) {
    log('\n[1] committing the seeded extractions through the real review screen')
    const context = await newContext(browser)
    await commitAll(context)
    await context.close()
  }
  /*
   * `wants('hero')` and not just `RUN.has('hero')`, because of one footgun worth closing.
   *
   * `--only review` with no pass flags runs ALL FIVE passes — that is what "no pass flags means all
   * of them" has always meant — and the hero pass costs a real vision call. Nobody typing a filter
   * naming one GIF intends to spend money on a different one.
   */
  if (RUN.has('hero') && wants('hero')) {
    log('\n[1c] the hero recording — a real upload through the real pipeline')
    await hero(browser)
  }
  if (RUN.has('warm')) {
    log('\n[1b] warming the insight cache')
    const context = await newContext(browser)
    await warm(context)
    await context.close()
  }
  if (RUN.has('stills')) {
    log('\n[2] stills')
    const context = await newContext(browser)
    await stills(context, browser)
    await context.close()
  }
  if (RUN.has('gifs')) {
    log('\n[3] gifs')
    await gifs(browser)
  }
  assertProducedWhatWasAsked()
  log('\nOK    docs/media/ is up to date')
} catch (err) {
  console.error(`\nFAIL  ${err.message}`)
  process.exitCode = 1
} finally {
  await browser.close()
  rmSync(VIDEO_DIR, { recursive: true, force: true })
}
