// Loaded into every Node process a verify run starts (NODE_OPTIONS=--import <this file>): the
// `next dev` server and its workers, and the seed script. Inert unless RI_VERIFY_STANDIN is set,
// which only verify.sh does.
//
// Three jobs, all on globalThis.fetch (Node's fetch ignores HTTP(S)_PROXY, so a dead proxy cannot
// stop it; Next wraps fetch after this preload, so the guard stays underneath):
//
// 1. Route the hosted services to the run's stand-in. The run's DATABASE_URL names the host
//    pg.riverify.invalid, so `neon()` POSTs to https://api.riverify.invalid/sql: rewritten to the
//    stand-in's /sql. Blob URLs of the run's fake store (https://<store>.public.blob.vercel-storage.com)
//    are rewritten to the stand-in's /files. The Blob API itself needs no rewrite: VERCEL_BLOB_API_URL
//    already points at the stand-in on loopback.
//
// 2. The paid-call budget. A fetch to z.ai (pool `llm`) or OpenRouter (pool `openrouter`) first takes
//    one call from the stand-in's counter; when the pool is empty, or the run is still seeding, the
//    fetch rejects as a network error, which is how the app sees a vendor outage.
//
// 3. Egress control. Every other host that is not loopback and not on RI_VERIFY_ALLOW_HOSTS is
//    refused and logged ("egress BLOCKED"). That includes every other Blob store (production's),
//    Neon, Google, and the web-push services. Best effort: web-push posts with node:https directly
//    and is not covered here (see SKILL.md Gotchas for why that cannot reach a person).
const standin = process.env.RI_VERIFY_STANDIN
if (standin) {
  const store = process.env.RI_VERIFY_STORE_HOST
  const allow = new Set(
    (process.env.RI_VERIFY_ALLOW_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
  )
  const paid = new Map(
    (process.env.RI_VERIFY_PAID_HOSTS ?? '')
      .split(',')
      .map((e) => e.trim().split('='))
      .filter(([h, p]) => h && p),
  )
  const loopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]'
  const real = globalThis.fetch

  globalThis.fetch = async function verifyFetch(input, init) {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
    let url
    try {
      url = new URL(href)
    } catch {
      return real(input, init)
    }
    const method = init?.method || (typeof input === 'object' && input?.method) || 'GET'
    if (url.hostname.endsWith('.riverify.invalid') && url.pathname === '/sql')
      return real(`${standin}/sql`, init)
    if (store && url.hostname === store) {
      // A Request input carries its own method/headers; a blob read is always a plain GET.
      return real(
        `${standin}/files${url.pathname}`,
        typeof input === 'object' && !(input instanceof URL) ? { method } : init,
      )
    }
    if (
      url.protocol === 'data:' ||
      url.protocol === 'blob:' ||
      loopback(url.hostname) ||
      allow.has(url.hostname)
    )
      return real(input, init)
    const pool = paid.get(url.hostname)
    if (pool) {
      const res = await real(
        `${standin}/budget/take?pool=${pool}&what=${encodeURIComponent(method + ' ' + url.pathname)}`,
        { method: 'POST' },
      )
      if (res.ok) return real(input, init)
      const why = (await res.json().catch(() => ({}))).why ?? res.status
      console.error(`ri-verify: paid call REFUSED ${method} ${url.origin}${url.pathname}: ${why}`)
      throw new TypeError(`ri-verify: paid call refused (${why})`)
    }
    console.error(`ri-verify: egress BLOCKED ${method} ${url.origin}${url.pathname}`)
    throw new TypeError(`ri-verify: egress to ${url.host} is blocked in a verify run`)
  }
}
