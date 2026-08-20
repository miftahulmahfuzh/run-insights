import { createRequire } from 'node:module'
const sharp = createRequire(import.meta.url)('/home/miftah/expense-tracking/node_modules/sharp/dist/index.cjs')
import { writeFileSync } from 'node:fs'
import { SYSTEM, SHAPE } from './schema.mjs'
import { score, extractJson } from './score.mjs'

const KEY = process.env.LLM_API_KEY
const CODING_V4 = 'https://api.z.ai/api/coding/paas/v4/chat/completions'
const DIR = '/home/miftah/.claude/image-cache/3a4e3940-26e9-4619-8bb5-9e0f6c5e0ad9'
const USER_TEXT = `These are screenshots of ONE running workout: the summary, the full splits table, and the heart-rate detail.\n\nReturn one JSON object with exactly this shape:\n${SHAPE}`

async function prep(file, variant) {
  let p = sharp(`${DIR}/${file}`)
  if (variant.width) p = p.resize({ width: variant.width })
  const buf = variant.jpeg ? await p.jpeg({ quality: variant.jpeg }).toBuffer() : await p.png().toBuffer()
  return { uri: `data:image/${variant.jpeg ? 'jpeg' : 'png'};base64,${buf.toString('base64')}`, bytes: buf.length }
}

const variants = {
  'original png 739w':   {},
  'png 560w':            { width: 560 },
  'jpeg q80 739w':       { jpeg: 80 },
  'jpeg q80 560w':       { width: 560, jpeg: 80 },
  'jpeg q70 460w':       { width: 460, jpeg: 70 },
}

const out = {}
for (const [name, v] of Object.entries(variants)) {
  const imgs = await Promise.all(['1.png', '2.png', '3.png'].map(f => prep(f, v)))
  const kb = Math.round(imgs.reduce((a, i) => a + i.bytes, 0) / 1024)
  const t = Date.now()
  const r = await fetch(CODING_V4, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'glm-4.6v', max_tokens: 4096, thinking: { type: 'disabled' },
      messages: [{ role: 'system', content: SYSTEM },
        { role: 'user', content: [...imgs.map(i => ({ type: 'image_url', image_url: { url: i.uri } })), { type: 'text', text: USER_TEXT }] }] }),
    signal: AbortSignal.timeout(180000),
  })
  const j = await r.json()
  const ms = Date.now() - t
  const got = extractJson(j?.choices?.[0]?.message?.content ?? '')
  const s = got ? score(got) : { pass: 0, total: 108, pct: '0.0', errs: ['NO JSON'] }
  out[name] = { kb, ms, in: j?.usage?.prompt_tokens, pct: s.pct, errs: s.errs }
  console.log(`${name.padEnd(20)} ${String(kb+'KB').padEnd(8)} ${String(ms+'ms').padEnd(9)} in=${String(j?.usage?.prompt_tokens).padEnd(6)} ${s.pass}/${s.total} (${s.pct}%)`)
  if (s.errs.length) console.log('    ' + s.errs.slice(0, 6).join('\n    '))
}
writeFileSync(new URL('./results-downscale.json', import.meta.url), JSON.stringify(out, null, 2))
