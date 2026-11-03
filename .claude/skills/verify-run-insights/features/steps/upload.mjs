// verify.sh ui RUN features/steps/upload.mjs
// The upload screen, the way a runner does it: pick the three shipped Fitness-app screenshots,
// let the browser compress and PUT each one to Blob (the run's stand-in), tap "Read this run", and
// wait on /x/<id> until the background vision read settles. Costs 1 paid llm call (2 when the
// repair pass fires); offline it ends on the read's failure state with nothing spent.
const steps = async ({ page, base, shot, log, fixture }) => {
  await page.goto(`${base}/upload`, { waitUntil: 'networkidle' })
  await page
    .locator('input[type="file"]')
    .setInputFiles([fixture('1.jpg'), fixture('2.jpg'), fixture('3.jpg')])
  const read = page.getByRole('button', { name: 'Read this run' })
  await read.waitFor()
  // Each tile compresses in a worker and PUTs to Blob; the button enables once all three landed.
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
  await read.click()
  await page.waitForURL(/\/x\/[^/]+$/, { timeout: 60_000 })
  log(`extraction: ${new URL(page.url()).pathname}`)
  // glm-4.6v takes 30-40 s; the page polls /api/extract/<id> and swaps to the review form.
  await page
    .getByText(/Nothing has been saved yet\.|couldn.t read|could not read|didn.t work|Try again/i)
    .first()
    .waitFor({ timeout: 180_000 })
  log((await page.locator('main').innerText()).slice(0, 600))
  await shot('settled')
}

export default steps
