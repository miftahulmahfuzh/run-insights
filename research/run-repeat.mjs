import { writeFileSync } from 'node:fs'
import { chat, imgPart } from './lib.mjs'
import { SYSTEM, SHAPE } from './schema.mjs'
import { score, extractJson } from './score.mjs'

const USER_TEXT = `These are screenshots of ONE running workout: the summary, the full splits table, and the heart-rate detail.\n\nReturn one JSON object with exactly this shape:\n${SHAPE}`
const body = () => ({
  model: 'glm-4.6v', max_tokens: 4096, thinking: { type: 'disabled' },
  messages: [{ role: 'system', content: SYSTEM },
    { role: 'user', content: [imgPart('1.png'), imgPart('2.png'), imgPart('3.png'), { type: 'text', text: USER_TEXT }] }],
})

const runs = []
for (let i = 1; i <= 5; i++) {
  try {
    const r = await chat(body())
    const got = extractJson(r.text)
    const s = got ? score(got) : { pass: 0, total: 108, pct: '0.0', errs: ['NO JSON'] }
    runs.push({ i, ms: r.ms, in: r.usage?.prompt_tokens, out: r.usage?.completion_tokens, pct: s.pct, errs: s.errs })
    console.log(`run ${i}: ${r.ms}ms in=${r.usage?.prompt_tokens} out=${r.usage?.completion_tokens} score=${s.pass}/${s.total} (${s.pct}%)`)
    if (s.errs.length) console.log('   ' + s.errs.join('\n   '))
  } catch (e) { console.log(`run ${i}: ERR ${e.message}`); runs.push({ i, err: e.message }) }
}
const ok = runs.filter(r => r.pct)
console.log(`\nSUMMARY: ${ok.filter(r=>r.pct==='100.0').length}/${runs.length} perfect · median ${ok.map(r=>r.ms).sort((a,b)=>a-b)[Math.floor(ok.length/2)]}ms`)
writeFileSync(new URL('./results-repeat.json', import.meta.url), JSON.stringify(runs, null, 2))
