// verify.sh ui RUN features/steps/upload-details.mjs -- KIND=/abs/a.jpg [KIND=/abs/b.jpg ...]
// The upload screen with a Workout Details screenshot, the way a runner does it: pick the files in
// the order given (the device's order), set each tile's kind by tapping its label (the swap rule
// keeps them distinct), tap "Read this run", and wait on /x/<id> until the read settles. KIND is
// summary | splits | heartrate | details. Logs EXTRACTION=<id> and how many "Estimated from the
// pace chart" labels the review shows. Costs 2 paid llm calls with a details tile (the primary read
// and the details read, in parallel), 1 for a details-only upload.
const LABEL = {
  summary: 'Summary',
  splits: 'Splits',
  heartrate: 'Heart rate',
  details: 'Workout Details',
}

const steps = async ({ page, base, shot, log, args }) => {
  const specs = args.map((arg) => {
    const at = arg.indexOf('=')
    const kind = arg.slice(0, at)
    const file = arg.slice(at + 1)
    if (at < 1 || !LABEL[kind] || !file) throw new Error(`pass KIND=/abs/path.jpg, got ${arg}`)
    return { kind, file }
  })
  if (specs.length < 1 || specs.length > 3) throw new Error('pass 1-3 KIND=/abs/path.jpg')

  await page.goto(`${base}/upload`, { waitUntil: 'networkidle' })
  await page.locator('input[type="file"]').setInputFiles(specs.map((s) => s.file))
  const groups = page.getByRole('radiogroup', { name: 'Which screen is this?' })
  await groups.nth(specs.length - 1).waitFor()

  for (const [i, { kind }] of specs.entries()) {
    const radio = groups.nth(i).getByRole('radio', { name: LABEL[kind] })
    if ((await radio.getAttribute('aria-checked')) !== 'true') await radio.click()
  }
  for (const [i, { kind }] of specs.entries()) {
    const checked = await groups
      .nth(i)
      .getByRole('radio', { name: LABEL[kind] })
      .getAttribute('aria-checked')
    if (checked !== 'true') throw new Error(`tile ${i + 1} is not ${LABEL[kind]}`)
  }
  log(`tiles: ${specs.map((s) => LABEL[s.kind]).join(' · ')}`)

  // A relabelled tile re-compresses and re-PUTs; the button enables once every tile has landed.
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        x.textContent?.includes('Read this run'),
      )
      return b && !b.disabled
    },
    null,
    { timeout: 90_000 },
  )
  await shot('picked')
  await page.getByRole('button', { name: 'Read this run' }).click()
  await page.waitForURL(/\/x\/[^/]+$/, { timeout: 60_000 })
  const id = new URL(page.url()).pathname.split('/').pop()
  log(`EXTRACTION=${id}`)

  await page
    .getByText(/Nothing has been saved yet\.|could not read/i)
    .first()
    .waitFor({ timeout: 180_000 })
  log(
    `distance label: ${await page.getByText('Estimated from the pace chart', { exact: true }).count()}`,
  )
  log(`splits label: ${await page.getByText(/^Estimated from the pace chart:/).count()}`)
  await shot('settled')
}

export default steps
