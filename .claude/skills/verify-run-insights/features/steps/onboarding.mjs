// verify.sh ui RUN features/steps/onboarding.mjs        (a run started with --seed=new)
// A brand-new runner: / sends them to /onboarding, they fill the profile and "Save and start", and
// land on the empty runs list. The profile row is what every HR-zone and max-HR number reads.
const steps = async ({ page, base, shot, log }) => {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  log(`/ landed on ${new URL(page.url()).pathname}`)
  if (!new URL(page.url()).pathname.startsWith('/onboarding'))
    await page.goto(`${base}/onboarding`, { waitUntil: 'networkidle' })
  await page.getByLabel('Age').fill('30')
  await page.getByLabel('Height').fill('173')
  await page.getByLabel('Weight').fill('64.5')
  await page.getByLabel('Resting heart rate').fill('52')
  await page.getByLabel('Measured max heart rate').fill('196')
  await shot('filled')
  await page.getByRole('button', { name: 'Save and start' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  log(
    `after save: ${new URL(page.url()).pathname}\n${(await page.locator('main').innerText()).slice(0, 400)}`,
  )
  await shot('after')
}

export default steps
