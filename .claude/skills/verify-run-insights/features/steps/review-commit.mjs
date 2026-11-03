// verify.sh ui RUN features/steps/review-commit.mjs -- EXTRACTION_ID [YYYY-MM-DD]
// The mandatory review: open /x/<id>, read what the screen asks you to check, Confirm & save, and
// land on the committed run at /r/<runId>. A date re-dates the run in the review form first (the
// demo runs are all from August, and the crons only look at runners with a run in the last 60 days).
const steps = async ({ page, base, shot, log, args }) => {
  const [id, date] = args
  if (!id) throw new Error('pass the extraction id: -- EXTRACTION_ID')
  await page.goto(`${base}/x/${id}`, { waitUntil: 'networkidle' })
  await page.getByText('Nothing has been saved yet.').waitFor()
  const checks = page.getByText(/thing(s)? worth checking|check(s)? still disagree/)
  log(`review banner: ${(await checks.count()) ? await checks.first().innerText() : 'no checks'}`)
  if (date) {
    await page.getByLabel('The day this run happened').fill(date)
    log(`re-dated to ${date}`)
  }
  await shot('review')
  await page.getByRole('button', { name: 'Confirm & save' }).click()
  await page.waitForURL(/\/r\/[^/]+$/, { timeout: 90_000 })
  log(`committed: ${new URL(page.url()).pathname}`)
  await page.waitForLoadState('networkidle')
  await shot('run')
}

export default steps
