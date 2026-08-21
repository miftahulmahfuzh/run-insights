/**
 * Executable assertions for F10's badge deck: the key boundary, the style contract's
 * parity with the catalog, and — once art exists — the manifest against the files on disk.
 *
 *   npm run badges:check
 *
 * Plain assertions in a file that exits non-zero, the same shape as this project's other
 * `scripts/check-*.mjs` guards. Nothing here touches the database, the network, the
 * environment or an API key.
 *
 * ── IT PASSES ON AN EMPTY DECK, AND THAT IS THE POINT ────────────────────────────────────
 * F10 ships the machinery before the art: 22 images at ~$0.04 and 4–5 minutes each, every
 * one needing a human to look at three crops before it is promoted (D12, plan §7). So this
 * script has to be meaningful in three states — no masters, some masters, all 22 — and it
 * reports which state it is in rather than pretending the deck is done or that it is broken.
 * §1 and §2 are checkable today and are checked today; §3 onward scale with what exists.
 *
 * ── WHAT A TYPE ALREADY COVERS, AND WHAT IT CANNOT ───────────────────────────────────────
 * `lib/badges/badge-art.ts` is a total `Record<BadgeKey, BadgeArt>`, so `npm run typecheck`
 * already refuses a badge key with no art — that is the stronger guarantee and it is not
 * repeated here. What a type cannot see is the disk: whether the files it names are actually
 * there, whether the bytes they were promoted from are the bytes still sitting in `assets/`,
 * and whether a superseded generation left orphans behind in `public/badges/`.
 *
 * The hash assertion is the one worth understanding. Each shipped filename carries the first
 * 8 hex of its master's SHA-256, and this script recomputes that SHA-256 from the master.
 * That is what turns "the shipped file is the approved master" from a hope into a checked
 * statement — and it is what licenses `next.config.ts` to serve /badges/* as `immutable`.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BOUNDARY_DIRS, checkOpenRouterBoundary } from './check-openrouter-boundary.mjs'

const root = join(import.meta.dirname, '..')
const MASTERS = join(root, 'assets', 'badges')
const PUBLIC = join(root, 'public', 'badges')
const MANIFEST = join(root, 'lib', 'badges', 'badge-art.ts')
const CATALOG = join(root, 'lib', 'badges', 'catalog.ts')
const STYLE = join(root, '.claude', 'skills', 'generate-badge', 'style.md')

let failures = 0

function ok(label) {
  console.log(`  ok   ${label}`)
}

function fail(label, detail) {
  failures++
  console.error(`  FAIL ${label}${detail ? `\n         ${detail}` : ''}`)
}

function assert(condition, label, detail) {
  if (condition) ok(label)
  else fail(label, detail)
}

function section(title) {
  console.log(`\n${title}`)
}

/* ------------------------------- the two parsers ------------------------------ */

/**
 * Badge keys out of `lib/badges/catalog.ts`, in catalog order.
 *
 * Regex-parsed rather than imported, for the same reason `tools/gen_badge_art.py` parses it:
 * this is a plain `.mjs` script with no TypeScript loader, and the catalog is a hand-written
 * array literal whose shape is stable by contract (`badge('key', 'Title', 'scope')`). The
 * three files that read it — this one and the two Python tools — carry the same pair of
 * expressions, and all three fail loudly rather than silently returning zero keys.
 */
function catalogKeys() {
  const text = readFileSync(CATALOG, 'utf8')
  const array = /BADGE_CATALOG[^=]*=\s*\[(.*?)^\]/ms.exec(text)
  if (!array) throw new Error(`could not find \`BADGE_CATALOG … = [ … ]\` in ${CATALOG}`)
  const keys = [...array[1].matchAll(/^\s*badge\(\s*'([a-z0-9_]+)'/gm)].map((m) => m[1])
  if (keys.length === 0) throw new Error(`BADGE_CATALOG parsed to zero keys`)
  return keys
}

/** Scene keys inside `<!-- SCENES -->` in style.md, plus the style block's version. */
function styleContract() {
  const text = readFileSync(STYLE, 'utf8')
  const version = /^<!-- STYLE BLOCK (v\d+) -->$/m.exec(text)
  const scenes = /^<!-- SCENES -->$\n(.*?)^<!-- \/SCENES -->$/ms.exec(text)
  if (!version) throw new Error('style.md has no `<!-- STYLE BLOCK vN -->` marker on its own line')
  if (!scenes) throw new Error('style.md has no `<!-- SCENES -->` region with markers on own lines')
  const keys = [...scenes[1].matchAll(/^- ([a-z0-9_]+): (.+)$/gm)].map((m) => m[1])
  return { version: version[1], keys }
}

/** One `key: { field: 'value', … }` entry per badge, out of the generated manifest. */
function manifestEntries() {
  const text = readFileSync(MANIFEST, 'utf8')
  const body = /BADGE_ART: Record<BadgeKey, BadgeArt> = \{(.*)^\}/ms.exec(text)
  if (!body) throw new Error('could not find `BADGE_ART: Record<BadgeKey, BadgeArt> = { … }`')
  const entries = new Map()
  for (const m of body[1].matchAll(/^ {2}([a-z0-9_]+): \{(.*?)^ {2}\},$/gms)) {
    const fields = {}
    for (const f of m[2].matchAll(/^\s*([a-zA-Z0-9]+): '([^']*)',$/gm)) fields[f[1]] = f[2]
    entries.set(m[1], fields)
  }
  return entries
}

/* --------------------------------- §1 the key --------------------------------- */

section(`§1  OPENROUTER_API_KEY stays outside ${BOUNDARY_DIRS.join('/, ')}/`)
{
  const result = checkOpenRouterBoundary()
  assert(
    result.ok,
    'the key is named by tools/gen_badge_art.py and by nothing that ships',
    result.ok ? '' : `${result.reason}\n${result.detail}`,
  )
}

/* ------------------------- §2 the contract and the catalog ------------------------- */

section('§2  style.md ↔ BADGE_CATALOG parity')
const keys = catalogKeys()
const style = styleContract()
{
  const missing = keys.filter((k) => !style.keys.includes(k))
  const orphan = style.keys.filter((k) => !keys.includes(k))
  assert(
    missing.length === 0,
    `every one of the ${keys.length} catalog keys has a scene line`,
    missing.length ? `no scene line for: ${missing.join(', ')}` : '',
  )
  assert(
    orphan.length === 0,
    'every scene line names a real catalog key',
    orphan.length ? `scene line with no badge: ${orphan.join(', ')}` : '',
  )
  console.log(`  --   style block is ${style.version}; ${keys.length} keys both ways`)
}

/* ----------------------------- §3 the masters on disk ----------------------------- */

section('§3  approved masters and their sidecars')
const promoted = keys.filter((k) => existsSync(join(MASTERS, `${k}.png`)))
console.log(`  --   ${promoted.length} of ${keys.length} badges promoted to assets/badges/`)
{
  const noSidecar = promoted.filter((k) => !existsSync(join(MASTERS, `${k}.txt`)))
  assert(
    noSidecar.length === 0,
    'every promoted master carries its .txt sidecar',
    noSidecar.length
      ? `no sidecar for: ${noSidecar.join(', ')} — promotion copies BOTH files, always, ` +
          `because make_badge_assets.py reads the style version out of the sidecar`
      : '',
  )

  const versions = new Map()
  for (const key of promoted) {
    const sidecar = join(MASTERS, `${key}.txt`)
    if (!existsSync(sidecar)) continue
    const m = /^style version:\s*(v\d+)\s*$/m.exec(readFileSync(sidecar, 'utf8'))
    if (m) versions.set(key, m[1])
  }
  const distinct = [...new Set(versions.values())]
  assert(
    distinct.length <= 1,
    'the whole deck was generated against one style version',
    distinct.length > 1
      ? `MIXED: ${distinct.join(', ')} — a style-block change invalidates every badge ` +
          `promoted under the old one (plan §7 task 4). This is a stop-and-decide, not a warning.`
      : '',
  )
  if (distinct.length === 1) {
    assert(
      distinct[0] === style.version,
      `the deck's style version matches style.md (${style.version})`,
      `masters are ${distinct[0]}, style.md is ${style.version} — either the block was bumped ` +
        `without regenerating, or a regeneration was never promoted`,
    )
  }

  // The anchor is one of the approved masters, byte for byte. Not "an image that looks like
  // one": every badge after the first is generated with --reference against this file, so an
  // anchor that is a stray candidate rather than a promoted master means the deck agrees
  // with something nobody ever approved.
  const anchor = join(MASTERS, '_anchor.png')
  if (promoted.length === 0) {
    console.log('  --   no masters yet; the anchor run has not happened (plan §9 task 9)')
  } else if (!existsSync(anchor)) {
    fail(
      'assets/badges/_anchor.png exists',
      'masters are promoted but no anchor is set. Every badge after the first must be ' +
        'generated against it: `cp assets/badges/<first>.png assets/badges/_anchor.png`',
    )
  } else {
    const anchorSha = createHash('sha256').update(readFileSync(anchor)).digest('hex')
    const match = promoted.find(
      (k) =>
        createHash('sha256')
          .update(readFileSync(join(MASTERS, `${k}.png`)))
          .digest('hex') === anchorSha,
    )
    assert(
      match !== undefined,
      `_anchor.png is a byte-identical copy of an approved master${match ? ` (${match})` : ''}`,
      'the anchor matches no promoted master — it is a candidate, or a stale copy of one',
    )
  }
}

/* ------------------------- §4 the manifest against the disk ------------------------- */

section('§4  lib/badges/badge-art.ts against public/badges/')
if (!existsSync(MANIFEST)) {
  if (promoted.length === keys.length && keys.length > 0) {
    fail(
      'the manifest exists once all 22 masters are promoted',
      'every master is promoted but no manifest was generated — run ' +
        '`python3 tools/make_badge_assets.py`, in its own commit',
    )
  } else {
    console.log(
      '  --   no manifest yet, and none is possible: it is a TOTAL Record and ' +
        `${keys.length - promoted.length} masters are still missing`,
    )
  }
} else {
  const entries = manifestEntries()
  const missing = keys.filter((k) => !entries.has(k))
  const orphan = [...entries.keys()].filter((k) => !keys.includes(k))
  assert(
    missing.length === 0,
    `the manifest names all ${keys.length} catalog keys`,
    missing.length ? `absent from BADGE_ART: ${missing.join(', ')}` : '',
  )
  assert(
    orphan.length === 0,
    'the manifest names no key the catalog dropped',
    orphan.length ? `art with no badge: ${orphan.join(', ')} — regenerate the manifest` : '',
  )

  const expected = new Set()
  const badHash = []
  const absent = []
  for (const [key, art] of entries) {
    const master = join(MASTERS, `${key}.png`)
    if (existsSync(master)) {
      const sha = createHash('sha256').update(readFileSync(master)).digest('hex')
      if (sha !== art.sha256) badHash.push(`${key}: master is ${sha.slice(0, 8)}…`)
      else if (!art.src.includes(`.${sha.slice(0, 8)}.`))
        badHash.push(`${key}: filename hash is not the sha256's first 8`)
    } else {
      badHash.push(`${key}: no master at assets/badges/${key}.png to verify against`)
    }
    for (const url of [art.src, art.small]) {
      const name = url.replace(/^\/badges\//, '')
      expected.add(name)
      if (!existsSync(join(PUBLIC, name))) absent.push(name)
    }
  }
  assert(
    badHash.length === 0,
    'every shipped filename carries its master’s real SHA-256',
    badHash.join('\n         '),
  )
  assert(
    absent.length === 0,
    'every file the manifest names exists under public/badges/',
    absent.length ? `missing: ${absent.join(', ')}` : '',
  )

  const shipped = existsSync(PUBLIC)
    ? readdirSync(PUBLIC).filter((n) => statSync(join(PUBLIC, n)).isFile())
    : []
  const orphaned = shipped.filter((n) => !expected.has(n))
  assert(
    orphaned.length === 0,
    'public/badges/ holds no stale file from a superseded generation',
    orphaned.length
      ? `orphans: ${orphaned.join(', ')} — /badges/* is served immutable, so a stale file ` +
          `here is a file that never expires. Re-run tools/make_badge_assets.py, which sweeps them.`
      : '',
  )
}

/* ----------------------------------- the verdict ----------------------------------- */

console.log('')
if (failures > 0) {
  console.error(`badges:check FAILED — ${failures} assertion(s)`)
  process.exit(1)
}
console.log(
  promoted.length === keys.length && keys.length > 0
    ? `badges:check OK — the deck is complete: ${keys.length} badges, style ${style.version}`
    : `badges:check OK — ${promoted.length}/${keys.length} badges generated, style ${style.version}`,
)
