import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export const KEY = process.env.LLM_API_KEY
export const CODING_V4 = 'https://api.z.ai/api/coding/paas/v4/chat/completions'
// The committed fixtures, not the wiped image-cache dir this pointed at until 2026-09-12.
// RI_FIXTURE_DIR is the same override tests/live/vision.live.test.ts honors.
const DIR = process.env.RI_FIXTURE_DIR
  ?? fileURLToPath(new URL('./fixtures/screenshots', import.meta.url))
export const dataUri = (n) => `data:image/png;base64,${readFileSync(`${DIR}/${n}`).toString('base64')}`
export const imgPart = (n) => ({ type: 'image_url', image_url: { url: dataUri(n) } })

export async function chat(body, { timeout = 180000 } = {}) {
  const t = Date.now()
  const r = await fetch(CODING_V4, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  })
  const j = await r.json()
  const msg = j?.choices?.[0]?.message ?? {}
  return {
    status: r.status, ms: Date.now() - t, raw: j,
    text: msg.content ?? '',
    reasoning: msg.reasoning_content ?? '',
    toolCalls: msg.tool_calls ?? null,
    usage: j?.usage ?? null,
    finish: j?.choices?.[0]?.finish_reason,
  }
}
