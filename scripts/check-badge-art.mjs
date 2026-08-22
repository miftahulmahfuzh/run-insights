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
 * ── TWO DECKS, ONE SCRIPT ────────────────────────────────────────────────────────────────
 * F09's 22 badges and F25's 10 personal-record patches are separate decks — separate catalogs,
 * separate masters, separate manifests — and §2 to §4 below run once per deck, driven by
 * `tools/decks.json`. §1 is global: there is one API key and one boundary.
 *
 * The ANCHOR is the deliberate exception. Both decks are one bolt of cloth and share
 * `assets/badges/_anchor.png`, so it is checked ONCE, against every promoted master across
 * every deck — a per-deck anchor check would demand a record master match a badge anchor and
 * fail by construction.
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
const STYLE = join(root, '.claude', 'skills', 'generate-badge', 'style.md')

/**
 * The deck table, read rather than restated.
 *
 * `tools/decks.py` owns it and serialises it here, because this file is JavaScript and cannot
 * import the Python. The alternative — a second table hand-copied into this file — is exactly
 * the drift the shared table exists to prevent, so `python3 tools/decks.py --selftest` fails
 * if the JSON on disk has fallen behind its source. Regenerate with `--write`.
 */
const DECKS_JSON = join(root, 'tools', 'decks.json')

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

/* --------------------------------- the deck table --------------------------------- */

const { decks } = JSON.parse(readFileSync(DECKS_JSON, 'utf8'))
const DECKS = Object.values(decks)

/* ------------------------------- the three parsers ------------------------------ */

/**
 * One deck's keys out of its own catalog module, in catalog order.
 *
 * Regex-parsed rather than imported, for the same reason `tools/gen_badge_art.py` parses it:
 * this is a plain `.mjs` script with no TypeScript loader, and the catalogs are hand-written
 * array literals whose shapes are stable by contract. THE SHAPE DIFFERS PER DECK — F09's is
 * `badge('key', 'Title', 'scope')` and F06's is `{ key: 'longest_distance', … }` — which is
 * why the pattern arrives from `decks.json` beside the path it applies to rather than being
 * written here. Every reader fails loudly rather than silently returning zero keys.
 */
function catalogKeys(deck) {
  const path = join(root, deck.catalog)
  const text = readFileSync(path, 'utf8')
  const array = new RegExp(`${deck.catalog_array}[^=]*=\\s*\\[(.*?)^\\]`, 'ms').exec(text)
  if (!array) throw new Error(`could not find \`${deck.catalog_array} … = [ … ]\` in ${path}`)
  const keys = [...array[1].matchAll(new RegExp(deck.key_pattern, 'gm'))].map((m) => m[1])
  if (keys.length === 0) throw new Error(`${deck.catalog_array} parsed to zero keys`)
  return keys
}

/** The shared style block's version, once. Both decks are sent the same block. */
function styleBlockVersion(text) {
  const version = /^<!-- STYLE BLOCK (v\d+) -->$/m.exec(text)
  if (!version) throw new Error('style.md has no `<!-- STYLE BLOCK vN -->` marker on its own line')
  return version[1]
}

/**
 * One deck's scene keys. The version is the shared block's, for every deck.
 *
 * There was briefly a per-deck addendum appended to the block, so the records deck could
 * describe its fifth silhouette without a v3 bump that would have invalidated 22 promoted
 * badges. It was removed on evidence — with any addendum present the image model ignored the
 * scene entirely — so both decks really are generated against the identical STYLE BLOCK v2 and
 * both honestly stamp `v2`. `tools/decks.py`'s header has the measurements.
 */
function styleContract(deck, text, blockVersion) {
  const scenes = new RegExp(
    `^<!-- ${deck.scenes_marker} -->$\\n(.*?)^<!-- /${deck.scenes_marker} -->$`,
    'ms',
  ).exec(text)
  if (!scenes) {
    throw new Error(
      `style.md has no \`<!-- ${deck.scenes_marker} -->\` region with markers on their own lines`,
    )
  }
  const version = blockVersion
  const keys = [...scenes[1].matchAll(/^- ([a-z0-9_]+): (.+)$/gm)].map((m) => m[1])
  return { version, keys }
}

/** One `key: { field: 'value', … }` entry per patch, out of a deck's generated manifest. */
function manifestEntries(deck) {
  const path = join(root, deck.manifest)
  const text = readFileSync(path, 'utf8')
  const header = `${deck.const_name}: Record<${deck.key_type}, ${deck.art_type}> = \\{`
  const body = new RegExp(`${header}(.*)^\\}`, 'ms').exec(text)
  if (!body) throw new Error(`could not find \`${deck.const_name}: Record<…> = { … }\` in ${path}`)
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
    'the key is named by tools/{gen,extend}_badge_art.py and by nothing that ships',
    result.ok ? '' : `${result.reason}\n${result.detail}`,
  )
}

/* ------------------------------- §2–§4, per deck ------------------------------- */

const styleText = readFileSync(STYLE, 'utf8')
const blockVersion = styleBlockVersion(styleText)
const summaries = []
/** Every promoted master across every deck, for the one shared anchor check below. */
const allPromoted = []

for (const deck of DECKS) {
  const MASTERS = join(root, deck.masters)
  const PUBLIC = join(root, deck.public)
  const MANIFEST = join(root, deck.manifest)

  section(`§2  style.md ↔ ${deck.catalog_array} parity  [${deck.name}]`)
  const keys = catalogKeys(deck)
  const style = styleContract(deck, styleText, blockVersion)
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
      orphan.length ? `scene line with no key: ${orphan.join(', ')}` : '',
    )
    console.log(
      `  --   <!-- ${deck.scenes_marker} -->, style ${style.version}; ` +
        `${keys.length} keys both ways`,
    )
  }

  section(`§3  approved masters and their sidecars  [${deck.name}]`)
  const promoted = keys.filter((k) => existsSync(join(MASTERS, `${k}.png`)))
  allPromoted.push(...promoted.map((k) => join(MASTERS, `${k}.png`)))
  console.log(`  --   ${promoted.length} of ${keys.length} promoted to ${deck.masters}/`)
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
      const m = /^style version:\s*(v\d+(?:\+[a-z0-9]+)?)\s*$/m.exec(readFileSync(sidecar, 'utf8'))
      if (m) versions.set(key, m[1])
    }
    const distinct = [...new Set(versions.values())]
    assert(
      distinct.length <= 1,
      'the whole deck was generated against one style version',
      distinct.length > 1
        ? `MIXED: ${distinct.join(', ')} — a style-block change invalidates every patch ` +
            `promoted under the old one (plan §7 task 4). This is a stop-and-decide, not a warning.`
        : '',
    )
    if (distinct.length === 1) {
      assert(
        distinct[0] === style.version,
        `the deck's style version matches style.md (${style.version})`,
        `masters are ${distinct[0]}, style.md says this deck should be ${style.version} — ` +
          `either the block was bumped without regenerating, or a regeneration was never promoted`,
      )
    }
  }

  section(`§4  ${deck.manifest} against ${deck.public}/  [${deck.name}]`)
  if (!existsSync(MANIFEST)) {
    if (promoted.length === keys.length && keys.length > 0) {
      fail(
        `the manifest exists once all ${keys.length} masters are promoted`,
        'every master is promoted but no manifest was generated — run ' +
          `\`python3 tools/make_badge_assets.py --deck ${deck.name}\`, in its own commit`,
      )
    } else {
      console.log(
        '  --   no manifest yet, and none is possible: it is a TOTAL Record and ' +
          `${keys.length - promoted.length} masters are still missing`,
      )
    }
  } else {
    const entries = manifestEntries(deck)
    const missing = keys.filter((k) => !entries.has(k))
    const orphan = [...entries.keys()].filter((k) => !keys.includes(k))
    assert(
      missing.length === 0,
      `the manifest names all ${keys.length} catalog keys`,
      missing.length ? `absent from ${deck.const_name}: ${missing.join(', ')}` : '',
    )
    assert(
      orphan.length === 0,
      'the manifest names no key the catalog dropped',
      orphan.length ? `art with no key: ${orphan.join(', ')} — regenerate the manifest` : '',
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
        badHash.push(`${key}: no master at ${deck.masters}/${key}.png to verify against`)
      }
      for (const url of [art.src, art.small]) {
        const name = url.replace(`${deck.url}/`, '')
        expected.add(name)
        if (!existsSync(join(PUBLIC, name))) absent.push(name)
      }
    }
    assert(
      badHash.length === 0,
      'every shipped filename carries its master\u2019s real SHA-256',
      badHash.join('\n         '),
    )
    assert(
      absent.length === 0,
      `every file the manifest names exists under ${deck.public}/`,
      absent.length ? `missing: ${absent.join(', ')}` : '',
    )

    const shipped = existsSync(PUBLIC)
      ? readdirSync(PUBLIC).filter((n) => statSync(join(PUBLIC, n)).isFile())
      : []
    const orphaned = shipped.filter((n) => !expected.has(n))
    assert(
      orphaned.length === 0,
      `${deck.public}/ holds no stale file from a superseded generation`,
      orphaned.length
        ? `orphans: ${orphaned.join(', ')} — ${deck.url}/* is served immutable, so a stale file ` +
            `here is a file that never expires. Re-run tools/make_badge_assets.py --deck ` +
            `${deck.name}, which sweeps them.`
        : '',
    )
  }

  summaries.push({ deck, promoted: promoted.length, total: keys.length, style: style.version })
}

/* --------------------------------- the shared anchor --------------------------------- */

section('§5  the anchor, shared by every deck')
{
  const anchorPath = join(root, DECKS[0].anchor)
  const sameAnchor = DECKS.every((d) => d.anchor === DECKS[0].anchor)
  assert(
    sameAnchor,
    'every deck names the same anchor',
    'decks.py grew a per-deck anchor — check 9b then stops measuring drift BETWEEN decks, ' +
      'which is the one drift no per-deck check can see. Re-read decks.py\u2019s header.',
  )
  if (allPromoted.length === 0) {
    console.log('  --   no masters yet; the anchor run has not happened (plan §9 task 9)')
  } else if (!existsSync(anchorPath)) {
    fail(
      `${DECKS[0].anchor} exists`,
      'masters are promoted but no anchor is set. Every patch after the first must be ' +
        `graded against it: \`cp <first master> ${DECKS[0].anchor}\``,
    )
  } else {
    const anchorSha = createHash('sha256').update(readFileSync(anchorPath)).digest('hex')
    const match = allPromoted.find(
      (m) => createHash('sha256').update(readFileSync(m)).digest('hex') === anchorSha,
    )
    assert(
      match !== undefined,
      `_anchor.png is a byte-identical copy of an approved master${
        match ? ` (${match.split('/').slice(-2).join('/')})` : ''
      }`,
      'the anchor matches no promoted master — it is a candidate, or a stale copy of one',
    )
  }
}

/* ----------------------------------- the verdict ----------------------------------- */

console.log('')
if (failures > 0) {
  console.error(`badges:check FAILED — ${failures} assertion(s)`)
  process.exit(1)
}
for (const s of summaries) {
  console.log(
    s.promoted === s.total && s.total > 0
      ? `badges:check OK — ${s.deck.name} is complete: ${s.total} patches, style ${s.style}`
      : `badges:check OK — ${s.deck.name}: ${s.promoted}/${s.total} generated, style ${s.style}`,
  )
}
