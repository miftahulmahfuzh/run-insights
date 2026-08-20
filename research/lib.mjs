import { readFileSync } from 'node:fs'
export const KEY = process.env.LLM_API_KEY
export const CODING_V4 = 'https://api.z.ai/api/coding/paas/v4/chat/completions'
const DIR = '/home/miftah/.claude/image-cache/3a4e3940-26e9-4619-8bb5-9e0f6c5e0ad9'
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
