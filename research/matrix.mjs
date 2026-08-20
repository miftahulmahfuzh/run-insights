import { readFileSync } from 'node:fs'
const KEY = process.env.LLM_API_KEY
const DIR = '/home/miftah/.claude/image-cache/3a4e3940-26e9-4619-8bb5-9e0f6c5e0ad9'
const B64 = readFileSync(`${DIR}/1.png`).toString('base64')
const PROMPT = 'What is the Distance and Avg Pace shown? Answer in one line.'

const endpoints = [
  ['anthropic',        'https://api.z.ai/api/anthropic/v1/messages'],
  ['coding-anthropic', 'https://api.z.ai/api/coding/paas/v4/v1/messages'],
]
const oai = [
  ['v4',        'https://api.z.ai/api/paas/v4/chat/completions'],
  ['coding-v4', 'https://api.z.ai/api/coding/paas/v4/chat/completions'],
]

async function post(url, headers, body) {
  const t = Date.now()
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const j = await r.json()
    return { status: r.status, ms: Date.now() - t, j }
  } catch (e) { return { status: 'ERR', ms: Date.now() - t, j: { error: e.message } } }
}

const show = (tag, res) => {
  const j = res.j
  const txt = j?.content?.map(c => c.text).join('') ?? j?.choices?.[0]?.message?.content ?? ''
  const usage = j?.usage ? `in=${j.usage.input_tokens ?? j.usage.prompt_tokens}` : ''
  const err = j?.error ? JSON.stringify(j.error).slice(0, 110) : ''
  console.log(`${tag.padEnd(34)} ${String(res.status).padEnd(4)} ${String(res.ms + 'ms').padEnd(8)} ${usage.padEnd(10)} ${String(txt).replace(/\n/g, ' ').slice(0, 90)} ${err}`)
}

for (const model of ['glm-4.6v', 'glm-5v-turbo', 'glm-4.6v-flash', 'glm-ocr']) {
  for (const [name, url] of endpoints) {
    show(`ANT ${name} ${model}`, await post(url, { 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }, {
      model, max_tokens: 256,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: B64 } },
        { type: 'text', text: PROMPT }] }],
    }))
  }
  for (const [name, url] of oai) {
    show(`OAI ${name} ${model}`, await post(url, { Authorization: `Bearer ${KEY}` }, {
      model, max_tokens: 256,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${B64}` } },
        { type: 'text', text: PROMPT }] }],
    }))
  }
}
