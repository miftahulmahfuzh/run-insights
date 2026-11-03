// verify.sh ui RUN features/steps/share.mjs [-- RUN_ID]
// Share a run (the icon on /r/<id>), then open the public link signed OUT, in the same fenced
// browser (cookies cleared, so the page sees a stranger). Default: the newest run on the list.
const steps = async ({ page, base, shot, log, args }) => {
  if (args[0]) await page.goto(`${base}/r/${args[0]}`, { waitUntil: 'networkidle' })
  else {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' })
    await page
      .getByRole('link', { name: /screenshots/ })
      .first()
      .click()
    await page.waitForURL(/\/r\/[^/]+$/)
    await page.waitForLoadState('networkidle')
  }
  const runPath = new URL(page.url()).pathname
  await page.getByRole('button', { name: 'Share this run' }).click()
  await page.getByText('This run has a live link.').waitFor()
  // Notifications and clipboard are not granted in a verify browser, so the copy fails and the
  // panel shows the link in a field instead ("Copy did not work — here is the link.").
  const field = page.getByLabel('Share link')
  await field.first().waitFor()
  const link = await field.first().inputValue()
  log(`shared ${runPath} -> ${link}`)
  await shot('shared')
  const url = new URL(link)
  await page.context().clearCookies()
  await page.goto(`${base}${url.pathname}`, { waitUntil: 'networkidle' })
  log(`public page (signed out):\n${(await page.locator('body').innerText()).slice(0, 1200)}`)
  await shot('public')
}

export default steps
