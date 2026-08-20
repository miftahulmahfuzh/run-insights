// Neon connectivity smoke test.
//   npm run db:smoke                       (reads .env.local, pooled)
//   node --env-file=.env.local scripts/db-smoke.mjs -- --unpooled
import { neon } from '@neondatabase/serverless'

const useUnpooled = process.argv.includes('--unpooled')
const varName = useUnpooled ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL'
const url = process.env[varName]

if (!url) {
  console.error(`FAIL  ${varName} is not set.`)
  process.exit(1)
}

const host = new URL(url).host
const looksPooled = host.includes('-pooler')
if (useUnpooled && looksPooled) {
  console.error(`FAIL  ${varName} points at a POOLED host (${host}). Use the direct string.`)
  process.exit(1)
}
if (!useUnpooled && !looksPooled) {
  console.warn(
    `WARN  ${varName} host (${host}) has no "-pooler". Runtime should use the pooled URL.`,
  )
}

const sql = neon(url)
const startedAt = Date.now()

try {
  const rows = await sql`
    select now() as now, current_database() as db, current_user as usr, version() as version
  `
  const row = rows[0]
  console.log(`OK    var      = ${varName}`)
  console.log(`OK    host     = ${host}`)
  console.log(`OK    database = ${row.db}`)
  console.log(`OK    user     = ${row.usr}`)
  console.log(`OK    now      = ${row.now}`)
  console.log(`OK    server   = ${row.version.split(',')[0]}`)
  console.log(`OK    latency  = ${Date.now() - startedAt} ms`)
} catch (err) {
  console.error(`FAIL  ${err.message}`)
  process.exit(1)
}
