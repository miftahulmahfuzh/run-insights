// Used by `verify.sh up --seed=demo`, not by hand: the capture harness's commit pass
// (scripts/capture/shoot.mjs commitAll), driven through the run's fenced browser. Opens each
// seeded extraction at /x/<id> and clicks "Confirm & save"; the app's own commitReviewAction writes
// the run, its splits and zones, and onRunCommitted recomputes records and awards badges.
const steps = async ({ page, base, log }) => {
  const ids = (process.env.RI_VERIFY_EXTRACTIONS ?? '').split(',').filter(Boolean)
  if (ids.length === 0) throw new Error('RI_VERIFY_EXTRACTIONS is empty')
  let committed = 0
  for (const [i, id] of ids.entries()) {
    await page.goto(`${base}/x/${id}`, { waitUntil: 'domcontentloaded' })
    if (new URL(page.url()).pathname.startsWith('/r/')) {
      committed++
      continue
    }
    const confirm = page.getByRole('button', { name: 'Confirm & save' })
    await confirm.waitFor({ timeout: 90_000 })
    // React 19 hydration: a click before the action is wired is silently dropped.
    await page.waitForLoadState('networkidle').catch(() => {})
    await confirm.click()
    try {
      await page.waitForURL(/\/r\/[^/]+$/, { timeout: 90_000 })
    } catch {
      throw new Error(
        `run ${i + 1} (${id}) did not commit; the screen says:\n${(await page.locator('body').innerText()).slice(0, 700)}`,
      )
    }
    committed++
  }
  log(`committed ${committed}/${ids.length}`)
}

export default steps
