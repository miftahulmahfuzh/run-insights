// verify.sh ui RUN features/steps/run-detail.mjs -- RUN_ID
// A run's page as drawn: the headline, then the pace/HR chart (the one dual-axis chart) and the
// written analysis (eyebrow "This run") once InsightTrigger has it. Read the PNGs.
const steps = async ({ page, base, shot, log, args }) => {
  const [id] = args
  if (!id) throw new Error('pass the run id: -- RUN_ID')
  await page.goto(`${base}/r/${id}`, { waitUntil: 'networkidle' })
  log(`headline: ${(await page.locator('main').innerText()).split('\n').slice(0, 6).join(' | ')}`)
  await shot('top')
  await page.getByText('Pace & heart rate').scrollIntoViewIfNeeded()
  await shot('chart')
  // A run nobody has viewed yet gets its narrative now (InsightTrigger, 1 llm call, 10-40 s). The
  // card's eyebrow is "This run"; until the prose lands it says the analysis is not ready.
  const pending = page.getByText('The written analysis is not ready')
  const t0 = Date.now()
  while ((await pending.count()) > 0 && Date.now() - t0 < 90_000) await page.waitForTimeout(2000)
  const ready =
    (await pending.count()) === 0 && (await page.getByText('This run', { exact: true }).count()) > 0
  log(`analysis: ${ready ? 'present' : 'not ready after 90 s'}`)
  if (ready) {
    await page.getByText('This run', { exact: true }).first().scrollIntoViewIfNeeded()
    await shot('analysis')
  }
}

export default steps
