import { writeFileSync } from 'node:fs'
import { chat, imgPart } from './lib.mjs'
import { SYSTEM, SHAPE } from './schema.mjs'
import { score, extractJson } from './score.mjs'

const USER_TEXT = `These are screenshots of ONE running workout: the summary, the full splits table, and the heart-rate detail.\n\nReturn one JSON object with exactly this shape:\n${SHAPE}`

const variants = {
  'A: 3-imgs 1-call, think off': {
    model: 'glm-4.6v', max_tokens: 4096, thinking: { type: 'disabled' },
    messages: [{ role: 'system', content: SYSTEM },
      { role: 'user', content: [imgPart('1.png'), imgPart('2.png'), imgPart('3.png'), { type: 'text', text: USER_TEXT }] }],
  },
  'B: 3-imgs 1-call, think on': {
    model: 'glm-4.6v', max_tokens: 8192,
    messages: [{ role: 'system', content: SYSTEM },
      { role: 'user', content: [imgPart('1.png'), imgPart('2.png'), imgPart('3.png'), { type: 'text', text: USER_TEXT }] }],
  },
  'C: 3-imgs labelled, think off': {
    model: 'glm-4.6v', max_tokens: 4096, thinking: { type: 'disabled' },
    messages: [{ role: 'system', content: SYSTEM },
      { role: 'user', content: [
        { type: 'text', text: 'IMAGE 1 — Summary screen:' }, imgPart('1.png'),
        { type: 'text', text: 'IMAGE 2 — Splits screen (transcribe every row):' }, imgPart('2.png'),
        { type: 'text', text: 'IMAGE 3 — Heart Rate screen:' }, imgPart('3.png'),
        { type: 'text', text: USER_TEXT }] }],
  },
}

const results = {}
for (const [name, body] of Object.entries(variants)) {
  process.stdout.write(`running ${name} ... `)
  let r
  try { r = await chat(body) } catch (e) { console.log('ERR', e.message); continue }
  const got = extractJson(r.text)
  const s = got ? score(got) : { pass: 0, total: 1, pct: '0.0', errs: ['NO JSON PARSED'] }
  results[name] = { ms: r.ms, usage: r.usage, finish: r.finish, pct: s.pct, pass: s.pass, total: s.total, errs: s.errs, got, rawText: r.text }
  console.log(`${r.status} ${r.ms}ms  in=${r.usage?.prompt_tokens} out=${r.usage?.completion_tokens}  score=${s.pass}/${s.total} (${s.pct}%)`)
  if (s.errs.length) console.log('   MISSES:\n' + s.errs.map(e => '     - ' + e).join('\n'))
}
writeFileSync(new URL('./results-extract.json', import.meta.url), JSON.stringify(results, null, 2))
