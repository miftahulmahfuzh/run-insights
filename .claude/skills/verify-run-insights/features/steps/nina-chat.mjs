// verify.sh ui RUN features/steps/nina-chat.mjs [-- "your message"]
// One real turn with Nina: type into the composer, send, and wait for her reply bubble. Costs
// 3-5 paid llm calls (one per tool round of her turn, plus titling/memory when they fire).
const steps = async ({ page, base, shot, log, args }) => {
  const text = args[0] ?? 'Nin, minggu ini aku udah lari berapa kali? Ada yang perlu kuperhatikan?'
  await page.goto(`${base}/nina`, { waitUntil: 'networkidle' })
  await shot('before')
  const box = page.getByRole('textbox', { name: 'Message Nina' })
  await box.fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByText(text).first().waitFor()
  log(`sent: ${text}`)
  // Her turn is a tool loop on glm-5.3 (one paid call per round, 15-90 s). "Nina is typing" shows
  // while it runs; wait for it to go, then for the page to stop changing.
  const t0 = Date.now()
  const typing = page.getByText('Nina is typing')
  await typing.waitFor({ timeout: 20_000 }).catch(() => {})
  await typing.waitFor({ state: 'hidden', timeout: 180_000 })
  let last = ''
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000)
    const now = await page.locator('main').innerText()
    if (now === last) break
    last = now
  }
  const tail = last.slice(last.lastIndexOf(text)).trim()
  log(`after sending (${Math.round((Date.now() - t0) / 1000)} s):\n${tail.slice(0, 1500)}`)
  await shot('reply')
}

export default steps
