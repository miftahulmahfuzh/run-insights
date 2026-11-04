// node standin.mjs <snapshot-dir> <listen-port> <pg-port> <db> <blob-dir> <store-id> <state-file> <llm-budget> <openrouter-budget>
//
// Stands in for the three hosted things a verify run must never reach, on one loopback port:
//
//   GET  /health             liveness, for verify.sh doctor
//   POST /sql                Neon's HTTP query protocol (what `neon()` and drizzle's neon-http
//                            driver speak), executed against the run's own local Postgres
//   WS   /v2                 a byte pipe to that Postgres (the shim's own Pool rides it)
//   *    /blob/...           the Vercel Blob API (`put`, `del`, `head`, `list`, `copy`, `rename`,
//                            and the browser's client-token PUT), stored under <blob-dir>; a client
//                            token's signature and options are enforced the way Vercel does
//                            Also served over HTTPS + HTTP/2 on RI_STANDIN_TLS_PORT for the browser:
//                            the Blob client streams its PUT body when the caller passes
//                            onUploadProgress, and Chromium streams a request body only over HTTP/2
//                            (over HTTP/1.1 it fails with ERR_ALPN_NEGOTIATION_FAILED). Vercel's real
//                            API is HTTP/2, so the browser gets the same here.
//   GET  /files/<pathname>   a stored blob's bytes (preload.mjs and ui.mjs route the fake store's
//                            https://<store-id>.public.blob.vercel-storage.com/... URLs here)
//   POST /budget/take?pool=  one paid call (pool llm = z.ai, pool openrouter = OpenRouter); 200
//                            while the pool has calls left and the run is armed, 402 otherwise
//   POST /budget/arm         seeding is over: paid calls may now spend the budget
//   GET  /budget             the counters
//
// Why: the app reaches Postgres only through @neondatabase/serverless over HTTP, and Blob only
// through @vercel/blob, so a local Postgres and a local directory answer neither. Nothing here
// knows production's URLs; the connection string in a request is ignored and every query runs on
// this run's database.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { createSecureServer } from 'node:http2'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [snap, portArg, pgPortArg, db, blobDir, storeId, stateFile, llmArg, orArg] =
  process.argv.slice(2)
if (!snap || !portArg || !pgPortArg || !db || !blobDir || !storeId || !stateFile) {
  console.error(
    'usage: node standin.mjs <snapshot> <port> <pg-port> <db> <blob-dir> <store-id> <state-file> <llm> <openrouter>',
  )
  process.exit(2)
}
const port = Number(portArg)
const pgPort = Number(pgPortArg)
const require = createRequire(path.join(snap, 'package.json'))
const WS = require('ws')
const neon = await import(
  pathToFileURL(path.join(snap, 'node_modules/@neondatabase/serverless/index.mjs')).href
)

/* ── budget ──────────────────────────────────────────────────────────────────────────────── */

const state = {
  armed: false,
  pools: {
    llm: { left: Number(llmArg ?? 0), spent: 0, refused: 0 },
    openrouter: { left: Number(orArg ?? 0), spent: 0, refused: 0 },
  },
  blobs: { put: 0, deleted: 0 },
}
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 1))
save()

function take(pool, what) {
  const p = state.pools[pool]
  if (!p) return { ok: false, why: `unknown pool ${pool}` }
  if (!state.armed) {
    p.refused++
    save()
    return { ok: false, why: 'seeding: paid calls are refused until the run is armed' }
  }
  if (p.left <= 0) {
    p.refused++
    save()
    return { ok: false, why: `${pool} budget spent (${p.spent} used)` }
  }
  p.left--
  p.spent++
  save()
  console.log(`paid ${pool} ${what} (left ${p.left})`)
  return { ok: true, left: p.left }
}

/* ── Neon HTTP ───────────────────────────────────────────────────────────────────────────── */

neon.neonConfig.webSocketConstructor = WS
neon.neonConfig.wsProxy = () => `127.0.0.1:${port}/v2`
neon.neonConfig.useSecureWebSocket = false
neon.neonConfig.pipelineConnect = false
const pool = new neon.Pool({
  connectionString: `postgresql://postgres@pg.riverify.invalid/${db}`,
  max: 8,
})

// Neon's HTTP protocol returns every value as text and lets the driver parse it by type oid.
const RAW = { getTypeParser: () => (v) => v }
const ISO = {
  ReadUncommitted: 'READ UNCOMMITTED',
  ReadCommitted: 'READ COMMITTED',
  RepeatableRead: 'REPEATABLE READ',
  Serializable: 'SERIALIZABLE',
}
const shape = (r) => ({
  command: r.command,
  rowCount: r.rowCount,
  rowAsArray: true,
  fields: (r.fields ?? []).map((f) => ({
    name: f.name,
    dataTypeID: f.dataTypeID,
    tableID: f.tableID,
    columnID: f.columnID,
    dataTypeSize: f.dataTypeSize,
    dataTypeModifier: f.dataTypeModifier,
    format: 'text',
  })),
  rows: r.rows ?? [],
})
const run = (client, q) =>
  client.query({ text: q.query, values: q.params ?? [], rowMode: 'array', types: RAW })
const brief = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 160)

async function sql(req, body) {
  const client = await pool.connect()
  try {
    if (!Array.isArray(body.queries)) {
      console.log(`sql  ${brief(body.query)}`)
      return shape(await run(client, body))
    }
    const iso = ISO[req.headers['neon-batch-isolation-level']] ?? ''
    const ro = req.headers['neon-batch-read-only'] === 'true' ? ' READ ONLY' : ''
    console.log(`tx   ${body.queries.length} statement(s)${iso ? ' ' + iso : ''}${ro}`)
    await client.query(`BEGIN${iso ? ' ISOLATION LEVEL ' + iso : ''}${ro}`)
    try {
      const results = []
      for (const q of body.queries) {
        console.log(`  sql ${brief(q.query)}`)
        results.push(shape(await run(client, q)))
      }
      await client.query('COMMIT')
      return { results }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    }
  } finally {
    client.release()
  }
}

/* ── Vercel Blob ─────────────────────────────────────────────────────────────────────────── */

const publicBase = `https://${storeId}.public.blob.vercel-storage.com`
mkdirSync(blobDir, { recursive: true })
const SUFFIX = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const suffix = () => [...randomBytes(30)].map((b) => SUFFIX[b % SUFFIX.length]).join('')
const safe = (p) => {
  const clean = path.posix.normalize(String(p).replace(/^\/+/, ''))
  if (!clean || clean.startsWith('..') || clean.includes('\0'))
    throw Object.assign(new Error('bad pathname'), { status: 400 })
  return clean
}
const fileOf = (p) => path.join(blobDir, safe(p))
const metaOf = (p) => `${fileOf(p)}.__meta.json`
const pathnameOf = (urlOrPath) => {
  const s = String(urlOrPath)
  if (s.startsWith('http')) {
    const u = new URL(s)
    if (u.hostname !== `${storeId}.public.blob.vercel-storage.com`)
      throw Object.assign(new Error(`not this run's store: ${u.hostname}`), { status: 404 })
    return safe(decodeURIComponent(u.pathname))
  }
  return safe(s)
}
const describe = (p) => {
  const m = JSON.parse(readFileSync(metaOf(p), 'utf8'))
  return {
    url: `${publicBase}/${p}`,
    downloadUrl: `${publicBase}/${p}?download=1`,
    pathname: p,
    size: m.size,
    uploadedAt: m.uploadedAt,
    contentType: m.contentType,
    contentDisposition: `inline; filename="${path.posix.basename(p)}"`,
    cacheControl: `public, max-age=${m.cacheControlMaxAge ?? 2592000}`,
    etag: `"${m.sha256}"`,
  }
}
function store(p, bytes, contentType, cacheControlMaxAge) {
  mkdirSync(path.dirname(fileOf(p)), { recursive: true })
  writeFileSync(fileOf(p), bytes)
  writeFileSync(
    metaOf(p),
    JSON.stringify({
      size: bytes.length,
      contentType,
      cacheControlMaxAge,
      sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 32),
      uploadedAt: new Date().toISOString(),
    }),
  )
  state.blobs.put++
  save()
  console.log(`blob put ${p} ${bytes.length}B`)
  return describe(p)
}
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) walk(f, out)
    else if (!e.name.endsWith('.__meta.json'))
      out.push(path.relative(blobDir, f).split(path.sep).join('/'))
  }
  return out
}
function withSuffix(p, headers) {
  if (headers['x-add-random-suffix'] !== '1' && headers['x-add-random-suffix'] !== 'true') return p
  const ext = path.posix.extname(p)
  return `${p.slice(0, p.length - ext.length)}-${suffix()}${ext}`
}
const blobErr = (status, code, message) => ({ status, body: { error: { code, message } } })
// With no x-content-type header (the browser's upload() sends none), Vercel types a blob by its
// pathname's extension.
const BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.json': 'application/json',
  '.txt': 'text/plain',
}
const typeOf = (h, p) =>
  h['x-content-type'] ?? BY_EXT[path.posix.extname(p).toLowerCase()] ?? 'application/octet-stream'

// The browser's upload() carries no option headers: the options live in the client token
// /api/upload minted (vercel_blob_client_<store>_<base64("<hmac>.<base64 json>")>), signed with
// the run's read-write token. Vercel verifies and applies them; so does this.
const rwToken = process.env.RI_STANDIN_RW_TOKEN ?? ''
function clientTokenOptions(auth) {
  const token = String(auth ?? '').replace(/^Bearer /, '')
  if (!token.startsWith('vercel_blob_client_')) return null
  const [, , , , encoded = ''] = token.split('_')
  const [sig = '', payload = ''] = Buffer.from(encoded, 'base64').toString().split('.')
  const want = createHmac('sha256', rwToken).update(payload).digest('hex')
  if (
    !rwToken ||
    sig.length !== want.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(want))
  ) {
    throw Object.assign(new Error('Invalid client token signature'), { status: 403 })
  }
  return JSON.parse(Buffer.from(payload, 'base64').toString())
}

async function blobApi(req, url, bytes) {
  const sub = url.pathname.replace(/^\/blob/, '') || '/'
  const h = req.headers
  if (req.method === 'PUT' && sub === '/') {
    const requested = safe(url.searchParams.get('pathname'))
    if (url.searchParams.get('fromUrl')) {
      const from = pathnameOf(url.searchParams.get('fromUrl'))
      if (!existsSync(fileOf(from))) return blobErr(404, 'not_found', 'source blob not found')
      const p = withSuffix(requested, h)
      return {
        status: 200,
        body: store(
          p,
          readFileSync(fileOf(from)),
          h['x-content-type'] ?? JSON.parse(readFileSync(metaOf(from), 'utf8')).contentType,
          h['x-cache-control-max-age'],
        ),
      }
    }
    const opts = clientTokenOptions(h.authorization)
    if (opts) {
      if (opts.pathname !== requested)
        return blobErr(403, 'forbidden', `client token is for ${opts.pathname}, not ${requested}`)
      if (opts.validUntil && Date.now() > opts.validUntil)
        return blobErr(403, 'forbidden', 'client token expired')
      if (opts.maximumSizeInBytes && bytes.length > opts.maximumSizeInBytes)
        return blobErr(
          400,
          'bad_request',
          `File size ${bytes.length} exceeds the maximum ${opts.maximumSizeInBytes}`,
        )
      const ct = typeOf(h, requested)
      if (opts.allowedContentTypes && !opts.allowedContentTypes.includes(ct))
        return blobErr(400, 'bad_request', `Content type ${ct} is not allowed`)
      if (opts.addRandomSuffix !== undefined)
        h['x-add-random-suffix'] = opts.addRandomSuffix ? '1' : '0'
      if (opts.allowOverwrite !== undefined)
        h['x-allow-overwrite'] = opts.allowOverwrite ? '1' : '0'
      if (opts.cacheControlMaxAge !== undefined)
        h['x-cache-control-max-age'] = String(opts.cacheControlMaxAge)
      console.log(
        `blob client-token put ${requested} (suffix=${opts.addRandomSuffix} max=${opts.maximumSizeInBytes})`,
      )
    }
    const p = withSuffix(requested, h)
    if (
      existsSync(fileOf(p)) &&
      h['x-allow-overwrite'] !== '1' &&
      h['x-allow-overwrite'] !== 'true'
    ) {
      return blobErr(
        400,
        'bad_request',
        'This blob already exists, use `allowOverwrite: true` if you want to overwrite it.',
      )
    }
    return { status: 200, body: store(p, bytes, typeOf(h, p), h['x-cache-control-max-age']) }
  }
  if (req.method === 'POST' && sub === '/delete') {
    const { urls = [] } = JSON.parse(bytes.toString('utf8') || '{}')
    for (const u of urls) {
      try {
        const p = pathnameOf(u)
        rmSync(fileOf(p), { force: true })
        rmSync(metaOf(p), { force: true })
        state.blobs.deleted++
        console.log(`blob del ${p}`)
      } catch (e) {
        console.log(`blob del refused ${u}: ${e.message}`)
      }
    }
    save()
    return { status: 200, body: {} }
  }
  if (req.method === 'POST' && sub === '/rename') {
    const from = pathnameOf(url.searchParams.get('fromUrl'))
    if (!existsSync(fileOf(from))) return blobErr(404, 'not_found', 'source blob not found')
    const to = safe(url.searchParams.get('pathname'))
    const body = store(
      to,
      readFileSync(fileOf(from)),
      JSON.parse(readFileSync(metaOf(from), 'utf8')).contentType,
    )
    rmSync(fileOf(from), { force: true })
    rmSync(metaOf(from), { force: true })
    return { status: 200, body }
  }
  if (req.method === 'GET' && sub === '/' && url.searchParams.get('url')) {
    const p = pathnameOf(url.searchParams.get('url'))
    if (!existsSync(metaOf(p)))
      return blobErr(404, 'not_found', 'The requested blob does not exist')
    return { status: 200, body: describe(p) }
  }
  if (req.method === 'GET' && sub === '/') {
    const prefix = url.searchParams.get('prefix') ?? ''
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    const all = walk(blobDir)
      .filter((p) => p.startsWith(prefix))
      .sort()
    const start = Number(url.searchParams.get('cursor') ?? 0)
    const page = all.slice(start, start + limit)
    const hasMore = start + limit < all.length
    const blobs = page.map((p) => {
      const d = describe(p)
      return {
        url: d.url,
        downloadUrl: d.downloadUrl,
        pathname: p,
        size: d.size,
        uploadedAt: d.uploadedAt,
        etag: d.etag,
      }
    })
    if (url.searchParams.get('mode') === 'folded') {
      const folders = [
        ...new Set(
          all
            .map((p) => p.slice(prefix.length))
            .filter((r) => r.includes('/'))
            .map((r) => prefix + r.split('/')[0] + '/'),
        ),
      ]
      return {
        status: 200,
        body: {
          blobs: blobs.filter((b) => !b.pathname.slice(prefix.length).includes('/')),
          folders,
          hasMore,
          cursor: hasMore ? String(start + limit) : undefined,
        },
      }
    }
    return {
      status: 200,
      body: { blobs, hasMore, cursor: hasMore ? String(start + limit) : undefined },
    }
  }
  if (sub.startsWith('/mpu'))
    return blobErr(
      400,
      'bad_request',
      'verify stand-in: multipart uploads are not implemented (no app upload is large enough to need one)',
    )
  return blobErr(400, 'bad_request', `verify stand-in: unhandled ${req.method} ${sub}`)
}

/* ── server ──────────────────────────────────────────────────────────────────────────────── */

const cors = (req) => ({
  'access-control-allow-origin': req.headers.origin ?? '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
  'access-control-max-age': '600',
})
const json = (req, res, status, body) =>
  res
    .writeHead(status, { 'content-type': 'application/json', ...cors(req) })
    .end(JSON.stringify(body))

function handle(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(req)).end()
    return
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    res
      .writeHead(200, { 'content-type': 'text/plain' })
      .end(`run-insights-verify-standin ok db=${db} store=${storeId}\n`)
    return
  }
  if (req.method === 'GET' && url.pathname === '/budget') {
    json(req, res, 200, state)
    return
  }
  if (req.method === 'POST' && url.pathname === '/budget/arm') {
    state.armed = true
    save()
    console.log('budget armed')
    json(req, res, 200, state)
    return
  }
  if (req.method === 'POST' && url.pathname === '/budget/take') {
    const r = take(url.searchParams.get('pool'), url.searchParams.get('what') ?? '')
    if (!r.ok)
      console.log(
        `paid ${url.searchParams.get('pool')} REFUSED ${url.searchParams.get('what') ?? ''}: ${r.why}`,
      )
    json(req, res, r.ok ? 200 : 402, r)
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
    let p
    try {
      p = safe(decodeURIComponent(url.pathname.slice('/files/'.length)))
    } catch {
      res.writeHead(400).end()
      return
    }
    if (!existsSync(metaOf(p))) {
      res
        .writeHead(404, { 'content-type': 'text/plain', ...cors(req) })
        .end('The requested blob does not exist')
      return
    }
    const m = JSON.parse(readFileSync(metaOf(p), 'utf8'))
    res.writeHead(200, {
      'content-type': m.contentType,
      'content-length': statSync(fileOf(p)).size,
      'cache-control': 'no-store',
      ...cors(req),
    })
    res.end(readFileSync(fileOf(p)))
    return
  }
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', async () => {
    const bytes = Buffer.concat(chunks)
    try {
      if (url.pathname === '/blob' || url.pathname.startsWith('/blob/')) {
        const out = await blobApi(req, url, bytes)
        if (out.status >= 400)
          console.log(
            `blob ${req.method} ${url.pathname}${url.search} -> ${out.status} ${out.body?.error?.message ?? ''}`,
          )
        json(req, res, out.status, out.body)
        return
      }
      if (req.method === 'POST' && url.pathname.startsWith('/sql')) {
        json(req, res, 200, await sql(req, JSON.parse(bytes.toString('utf8'))))
        return
      }
      res.writeHead(404).end()
    } catch (e) {
      console.log(`err  ${req.method} ${url.pathname} ${e.code ?? ''} ${brief(e.message)}`)
      if (url.pathname.startsWith('/blob')) {
        json(req, res, e.status ?? 400, { error: { code: 'bad_request', message: e.message } })
        return
      }
      const fields = [
        'code',
        'severity',
        'detail',
        'hint',
        'position',
        'schema',
        'table',
        'column',
        'constraint',
        'where',
      ]
      const err = { message: e.message }
      for (const f of fields) if (e[f] !== undefined) err[f] = e[f]
      json(req, res, 400, err)
    }
  })
}

const server = createServer(handle)

const tlsPort = Number(process.env.RI_STANDIN_TLS_PORT ?? 0)
if (tlsPort) {
  // A per-run self-signed certificate for 127.0.0.1; only the run's own browser accepts it.
  createSecureServer(
    {
      key: readFileSync(process.env.RI_STANDIN_TLS_KEY),
      cert: readFileSync(process.env.RI_STANDIN_TLS_CERT),
      allowHTTP1: true,
    },
    handle,
  ).listen(tlsPort, '127.0.0.1', () =>
    console.log(`standin listening on https://127.0.0.1:${tlsPort} (h2, for the browser)`),
  )
}

const wss = new WS.WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/v2')) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const pg = net.connect(pgPort, '127.0.0.1')
    const pending = []
    pg.on('connect', () => {
      for (const b of pending.splice(0)) pg.write(b)
    })
    ws.on('message', (data) => (pg.connecting ? pending.push(data) : pg.write(data)))
    pg.on('data', (data) => ws.readyState === ws.OPEN && ws.send(data))
    const close = () => {
      pg.destroy()
      if (ws.readyState === ws.OPEN) ws.close()
    }
    ws.on('close', close)
    ws.on('error', close)
    pg.on('close', close)
    pg.on('error', close)
  })
})

server.listen(port, '127.0.0.1', () =>
  console.log(
    `standin listening on http://127.0.0.1:${port} -> pg 127.0.0.1:${pgPort}/${db}, blobs ${blobDir}`,
  ),
)
