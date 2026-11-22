// verify.sh ui RUN features/steps/review-details.mjs -- EXTRACTION_ID [DISTANCE_KM|-] [YYYY-MM-DD]
// The review screen for a read that had a Workout Details screenshot: logs the distance, the split
// rows and which values carry the "Estimated from the pace chart" label; optionally types a new
// distance (and logs whether the distance label went away) and re-dates the run (two commits on one
// date and start time collide on the dedupe index); then Confirm & save and land on /r/<runId>.
// A commit costs 2-3 paid llm calls (the narrative, Nina's reaction).
const steps = async ({ page, base, shot, log, args }) => {
  const [id, km, date] = args
  if (!id) throw new Error('pass the extraction id: -- EXTRACTION_ID [DISTANCE_KM|-] [YYYY-MM-DD]')
  await page.goto(`${base}/x/${id}`, { waitUntil: 'networkidle' })
  await page.getByText('Nothing has been saved yet.').waitFor()

  const distanceLabel = page.getByText('Estimated from the pace chart', { exact: true })
  const splitsLabel = page.getByText(/^Estimated from the pace chart:/)
  const distance = page.getByLabel('Distance in kilometres')
  log(`distance: ${await distance.inputValue()}`)
  log(`split rows: ${await page.getByRole('button', { name: /^Edit kilometre / }).count()}`)
  log(`distance label: ${await distanceLabel.count()}`)
  log(`splits label: ${await splitsLabel.count()}`)
  const checks = page.getByText(/thing(s)? worth checking|check(s)? still disagree/)
  log(`review banner: ${(await checks.count()) ? await checks.first().innerText() : 'no checks'}`)
  await shot('review')

  if (km && km !== '-') {
    await distance.fill(km)
    await distance.press('Tab')
    log(`distance set to ${km}; distance label now: ${await distanceLabel.count()}`)
  }
  if (date) {
    await page.getByLabel('The day this run happened').fill(date)
    log(`re-dated to ${date}`)
  }
  await shot('edited')

  await page.getByRole('button', { name: 'Confirm & save' }).click()
  await page.waitForURL(/\/r\/[^/]+$/, { timeout: 90_000 })
  log(`committed: ${new URL(page.url()).pathname}`)
  await page.waitForLoadState('networkidle')
  await shot('run')
}

export default steps
