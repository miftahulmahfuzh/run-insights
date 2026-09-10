# Phase 1: Flash the landing in the bubble's own color — and prove the jobs jump end-to-end

**Plan set:** `JOB_JUMP_FLASH_PLAN.md`
**Analysis:** `20260910-090042_code_analyzer.md`
**Satisfies:** R1, R2 — R2 is the color change; R1 is the same change plus a live, end-to-end
proof that the "Proses foto" → "Buka chat-nya" → pinpoint+flicker flow actually works
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `components/nina`

---

## Goal

The landing blink on HIS bubbles stops being `#fff` — a 2px white ring on light sky paper
`#c9e9fb`, which the keyframe comment itself called "a modest step" — and becomes `var(--ink)`,
the bubble's own fill, so a jobs deep link (which always lands on one of his bubbles) reads as a
mechanism. The three comments that record the white decision are rewritten to record the
superseding ask. And because R1's exit criterion is the WORKING flow rather than the color alone,
the phase runs the real flow end-to-end against the real top job in a local prod build and logs
the result.

The mechanism itself is NOT missing — the analysis traced every link (`planJobJump` → `ButtonLink`
→ `ChatScreen.landOn` → `measureQuoteScroll` → `flashMessage` → `MessageBubble`), and this phase
does not add plumbing. If the live probe exposes a genuine break, that break is diagnosed with
systematic-debugging discipline and fixed WITHIN this phase, root cause recorded in the
Verification Log at the bottom of this file.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none
**Renames:** none
**Creates:** none — no new symbol, module, export, config key, env var, schema object or test
**Signature changes:** none
**String-literal change (the only code edit):** inside `components/nina/MessageBubble.tsx`, the
class literal `'[--nina-flash-ring-color:#fff]'` (line 485) becomes
`'[--nina-flash-ring-color:var(--ink)]'`. Not an exported symbol; no other module references the
literal (verified by grep: `--nina-flash-ring-color` is written exactly once in the repo, here,
and read twice by `app/globals.css:291,303` in the keyframe stops).
**Requires (from earlier phases):** none
**Leaves alone (owned by others / nobody):** `lib/nina/reply.ts`, `lib/nina/chatview.ts`,
`lib/nina/jobview.ts`, `components/nina/ChatScreen.tsx`, `components/nina/MessageList.tsx`,
`components/nina/NinaJobDetail.tsx`, `components/nina/NinaJobList.tsx`,
`app/nina/jobs/[id]/page.tsx`, `app/nina/page.tsx`, the `@keyframes nina-flash-blink` stops and
their `var(--nina-flash-ring-color, var(--accent))` defaults (`app/globals.css:288-306` — her
bubbles keep `--accent`), `tests/motion.reducedMotion.test.ts`, all other tests, all schema and
migrations, all env vars, `docs/design/tokens.css`.
**Comment-record changes (doc only):** `components/nina/MessageBubble.tsx:61-64` and `:465-483`;
`app/globals.css:260-266`; `lib/nina/search.ts:333-334` — each rewritten to record the new owner
ask verbatim and the supersession of the 09-09 ask.

## Files

| File | Action | What changes |
|---|---|---|
| `components/nina/MessageBubble.tsx` | modify | line 485: the ring-color literal `#fff` → `var(--ink)`; lines 61-64 (header) and 465-483 (call-site block): rewritten comments |
| `app/globals.css` | modify | lines 260-266: the keyframe header's colour paragraph rewritten (the `@keyframes` blocks at 288-306 are NOT touched) |
| `lib/nina/search.ts` | modify | lines 333-334: the landing prose's per-side colours updated |
| `.tmp-probe-jump.mjs` (worktree root, throwaway) | create, then delete | the live-verification probe script; never committed |

## Implementation Steps

### Step 0: Bootstrap the worktree (no source edit)

**File:** n/a
**Change:** This worktree has neither `.env.local` nor `node_modules` (verified: both absent).
`lib/env.ts` validates its vars at load, so build, lint and vitest all die until both exist.

**Code:**
```sh
cp /home/miftah/run-insights/.env.local /home/miftah/.worktrees/run-insights/job-jump-flash/.env.local
cd /home/miftah/.worktrees/run-insights/job-jump-flash && npm install
```

`.env.local` is git-ignored (the tree stays clean); `npm install` is needed by every later step.
`.env.local`'s `DATABASE_URL` IS the production database — this repo has one — but everything this
phase does with it is either a read-only SELECT (the re-measure, the probe's top-job lookup) or
the same idempotent bookkeeping a normal visit writes (`markNinaMessagesRead`, the stale-job
sweep). No migration runs, no phase step calls `db:migrate`.

**Impact:** none on the repo.

### Step 1: The ring color — the one code change (R2)

**File:** `components/nina/MessageBubble.tsx:485`
**Change:** `[--nina-flash-ring-color:#fff]` → `[--nina-flash-ring-color:var(--ink)]`.

**Code — before (line 484-486):**
```tsx
          'transition-shadow duration-300',
          flash && mine && '[--nina-flash-ring-color:#fff]',
          flash && '[animation:nina-flash-blink_0.32s_linear_var(--nina-flash-count,_4)]',
```

**Code — after:**
```tsx
          'transition-shadow duration-300',
          flash && mine && '[--nina-flash-ring-color:var(--ink)]',
          flash && '[animation:nina-flash-blink_0.32s_linear_var(--nina-flash-count,_4)]',
```

**Why this exact spelling** (recorded, not re-litigated — the plan index's Decision):

- The user said "warna yang sama dengan warna user's bubble itu sendiri". The bubble's fill is
  the class `bg-ink` (line 458, same `cn()` call), which is the theme-flipping token: `--ink` is
  `#1d2733` in light and `#f2f7fa` in dark (`app/globals.css:27,84`). A light-mode literal would
  vanish against dark paper `#0e1b26`; the token follows the scheme automatically.
- The Tailwind v4 arbitrary-property form `[--nina-flash-ring-color:var(--ink)]` is valid — the
  sibling line below already uses the same shape with a `var()` inside
  (`[animation:…_var(--nina-flash-count,_4)]`), so the scanner and the arbitrary-property parser
  both have a working precedent in this exact `cn()` call. `cn()` is a plain join (`lib/cn.ts`),
  no tailwind-merge, so the string passes through untouched.
- The variable resolves on this element: the keyframe stops
  (`app/globals.css:291,303`) read `var(--nina-flash-ring-color, var(--accent))` from the same
  element the class declares it on, and `--ink` itself is defined at `:root` in both schemes.
- Her bubbles are untouched: they have no `mine` arm, so they keep the keyframe's `--accent`
  default. The reduce-mode keyframe (`app/globals.css:299-306`) reads the same variable, so it
  follows the new color with no edit of its own, and `tests/motion.reducedMotion.test.ts` guards
  it by name-token and still-ness only — it asserts no color and needs no change.

**Impact:** every landing on a `mine` bubble — quote-tap, search hit, and the jobs deep link —
now blinks in the bubble's own fill. Dark mode is visually unchanged from today (ink ≈ the white
it replaces). Light mode is the fix: a 2px near-navy ring on `#c9e9fb` is unmistakable.

### Step 2: The call-site comment (the load-bearing history)

**File:** `components/nina/MessageBubble.tsx:465-483`
**Change:** replace the whole comment block. It must keep the count paragraph and the
`transition-shadow` paragraph byte-identical, keep the still-true half of the old reasoning
(why her side stays `--accent`), and record the new ask verbatim with its date, superseding the
09-09 ask.

**Code — before (lines 465-483):**
```tsx
          /*
           * The landing flash (R12: "clicking … will automatically scroll to that message"; a
           * scroll that does not say WHICH message it landed on has done half the job):
           * `nina-flash-blink` in `app/globals.css`, one hard blink per iteration, applied
           * INSTEAD of a steady ring and never beside one so the element's own box-shadow under
           * the animation is none and the train ends clean.
           *
           * The COUNT is not ours to choose — `--nina-flash-count` is set on `MessageList`'s
           * container from `flashBlinkCount(process.env.NINA_FLASH_BLINKS)` (owner-tuned in the
           * Vercel env; the `, 4` is only the fallback if that var ever stops arriving, and a
           * var() in the shorthand is what lets the count stay a value rather than a stop
           * rewrite). The COLOUR is: hers blink `--accent` (the keyframe's default); HIS blink
           * white — the owner's ask, "flicker buat user's bubble itu diganti warnanya jadi
           * putih", both for a quote tap landing on his bubble and for a search hit landing on
           * one — and against `bg-ink` a white rim reads as the bubble itself flashing, in both
           * schemes. The `transition-shadow` under the animation is not the flash's: it exists
           * for the FAILED ring above, which is a real class-driven shadow change and fades as
           * one. See the header for the whole story.
           */
```

**Code — after:**
```tsx
          /*
           * The landing flash (R12: "clicking … will automatically scroll to that message"; a
           * scroll that does not say WHICH message it landed on has done half the job):
           * `nina-flash-blink` in `app/globals.css`, one hard blink per iteration, applied
           * INSTEAD of a steady ring and never beside one so the element's own box-shadow under
           * the animation is none and the train ends clean.
           *
           * The COUNT is not ours to choose — `--nina-flash-count` is set on `MessageList`'s
           * container from `flashBlinkCount(process.env.NINA_FLASH_BLINKS)` (owner-tuned in the
           * Vercel env; the `, 4` is only the fallback if that var ever stops arriving, and a
           * var() in the shorthand is what lets the count stay a value rather than a stop
           * rewrite). The COLOUR on HIS side is now the bubble's own fill, and it has a
           * history: 2026-09-09 asked for white ("flicker buat user's bubble itu diganti
           * warnanya jadi putih") and 2026-09-10 superseded it after a night with it —
           * "kayanya flicker putih di user's bubble masih kurang conspicuous. coba ganti warna
           * nya jadi warna yang sama dengan warna user's bubble itu sendiri". The white was
           * exactly what the complaint named: a 2px #fff ring drawn OUTSIDE a `bg-ink` bubble
           * onto light sky paper `#c9e9fb`, the "modest step" the keyframe comment had
           * measured — and a jobs deep link ALWAYS lands on a bubble of his (the photo request
           * is his message), which is why that landing read as no mechanism while her `--accent`
           * blinks read as working. "Warna yang sama dengan warna user's bubble itu sendiri" is
           * the TOKEN, `var(--ink)`, and not a spelled hex: the fill flips with the scheme
           * (`#1d2733` light, `#f2f7fa` dark), a light-mode literal would vanish against dark
           * paper `#0e1b26`, and `bg-ink` on this very div already defines the variable — so
           * the ring reads as the bubble briefly thickening, in both schemes. HERS still take
           * the keyframe's `--accent` default and that half of the 09-09 reasoning stands: the
           * default lives once in `app/globals.css`, she has no `mine` arm here, and nothing
           * was ever asked about her side. Quote-tap landings and search-hit landings ride this
           * same `flash` prop, so they follow the new colour with no further edit. The
           * `transition-shadow` under the animation is not the flash's: it exists for the
           * FAILED ring above, which is a real class-driven shadow change and fades as one.
           * See the header for the whole story.
           */
```

**Impact:** comments only.

### Step 3: The header comment

**File:** `components/nina/MessageBubble.tsx:61-64`
**Change:** replace the four-line colour paragraph inside the R12 header block.

**Code — before (lines 61-64):**
```tsx
 * The COLOUR is per side: hers blink `--accent`; his blink white (`--nina-flash-ring-color`,
 * set below when `mine`) — "flicker buat user's bubble itu diganti warnanya jadi putih". Both
 * quote-tap landings and search-hit landings ride the same `flash` prop, so the reply-to box
 * pointing at one of his bubbles and a search hit inside one blink white alike.
```

**Code — after:**
```tsx
 * The COLOUR is per side: hers blink `--accent` (the keyframe's default); his blink the bubble's
 * own fill, `var(--ink)` (`--nina-flash-ring-color`, set below when `mine`). The white the ask
 * of 2026-09-09 chose — "flicker buat user's bubble itu diganti warnanya jadi putih" — lasted a
 * night: 2026-09-10, "kayanya flicker putih di user's bubble masih kurang conspicuous. coba
 * ganti warna nya jadi warna yang sama dengan warna user's bubble itu sendiri". Both quote-tap
 * landings, search-hit landings and `/nina/jobs`' "Buka chat-nya" ride the same `flash` prop —
 * and the jobs one always lands on a bubble of his, where a white ring on light sky paper was
 * the difference between the deep link reading as working and reading as broken.
```

**Impact:** comments only.

### Step 4: The keyframe header's colour paragraph

**File:** `app/globals.css:260-266`
**Change:** rewrite the paragraph. The `Born 2026-09-09` list at lines 248-252 above it stays —
it is the record of the 09-09 asks in order, and the paragraph below now carries the
supersession. The `@keyframes` blocks (288-306) and their `var(--accent)` defaults are NOT
touched.

**Code — before (lines 260-266):**
```css
 * AND THE COLOUR IS A VARIABLE TOO: `--nina-flash-ring-color`, defaulting to `--accent`. Her
 * bubbles take the default; his (`MessageBubble`, when `mine`) set it to white — the owner's
 * ask, and the one saturated edge his dark bubble can wear that hers cannot: a white ring
 * against `bg-ink` reads as the bubble itself flashing a bright rim, in both schemes (white on
 * light paper is a modest step, on dark paper a halo; both measured, both read). The literal
 * beats `--card` here on purpose: `--card` flips to near-navy in the dark scheme and the ring
 * would vanish against `--paper` exactly when the bubble is at its brightest.
```

**Code — after:**
```css
 * AND THE COLOUR IS A VARIABLE TOO: `--nina-flash-ring-color`, defaulting to `--accent`. Her
 * bubbles take the default and stay there — nothing was ever asked about her side. His
 * (`MessageBubble`, when `mine`) now set it to `var(--ink)`, the bubble's own fill, on the
 * owner's ask of 2026-09-10 — "kayanya flicker putih di user's bubble masih kurang conspicuous.
 * coba ganti warna nya jadi warna yang sama dengan warna user's bubble itu sendiri" — which
 * superseded 09-09's "flicker buat user's bubble itu diganti warnanya jadi putih" after one
 * night: the white this paragraph used to defend was the "modest step" it measured, 2px of #fff
 * on light sky paper `#c9e9fb`, and a jobs deep link always lands on a bubble of his, so that
 * landing read as no mechanism at all. The token is what "warna yang sama dengan warna user's
 * bubble itu sendiri" means: `--ink` flips with the scheme (`#1d2733` light, `#f2f7fa` dark),
 * so the ring is high-contrast against `--paper` in both, and beside `bg-ink` it reads as the
 * bubble itself briefly thickening. The 09-09 rejection of `--card` survives unchanged, for the
 * reason it was written: `--card` is HER fill, it flips to near-navy in the dark scheme, and a
 * ring in it would vanish against `--paper` exactly when his bubble is at its brightest.
```

**Impact:** comments only. The old paragraph's architecture claim ("the colour is a variable")
stays literally true; only the value's spelling and its justification change.

### Step 5: The search-hit landing prose

**File:** `lib/nina/search.ts:333-334`
**Change:** the doc comment over `searchHitHref` spells the per-side colours in prose. Two lines
change; the sentence continues unchanged onto line 335 ("the ask in one sentence — …").

**Code — before (lines 333-334):**
```tsx
 * scroll into the band the composer leaves over, then the landing blink (`nina-flash-blink`,
 * white on one of his bubbles, `--accent` on one of hers). That is
```

**Code — after:**
```tsx
 * scroll into the band the composer leaves over, then the landing blink (`nina-flash-blink` —
 * the bubble's own fill, `var(--ink)`, on one of his bubbles; `--accent` on one of hers). That
```

**Impact:** comments only.

### Step 6: Re-measure the top job (read-only)

**File:** none — a throwaway query, not committed.
**Change:** the analysis measured the probe target at 09:00 WIB. Re-measure before probing; if
the top item changed, the probe (Step 8) resolves it dynamically anyway, but the numbers below
are the expected values.

**Code:** write to `/home/miftah/run-insights/.tmp-remeasure.mjs` (run it from the MAIN checkout,
whose `node_modules` exists; the worktree's does after Step 0 too), run
`node --env-file=.env.local .tmp-remeasure.mjs` from `/home/miftah/run-insights`, then delete the
file:

```js
import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL)
const jobs = await sql.query(`
  select id, user_id, status, created_at, args->>'replyToId' as reply_to_id
  from nina_turns where kind = 'image' and deleted_at is null
  order by created_at desc limit 5`)
console.log(JSON.stringify(jobs, null, 2))
const top = jobs.find((j) => j.reply_to_id)
if (top) {
  // Correlated subqueries, NOT a window function: a window over the single fetched row
  // partitions to one row and reports 1-of-1 — measured wrong that way once already.
  const [m] = await sql.query(`
    select id, session_id, role, seq,
           (select count(*)::int from nina_messages m2 where m2.session_id = m.session_id) as session_len,
           (select count(*)::int from nina_messages m3 where m3.session_id = m.session_id and m3.seq >= m.seq) as from_end
    from nina_messages m where id = $1`, [top.reply_to_id])
  console.log('TOP READY JOB', top.id, '→ TARGET', JSON.stringify(m))
}
```

**Expected (measured 2026-09-10, read-only against production):**
- Top job: `xZoxXUCsWUzq`, `ok`, created `2026-09-10T01:50:02Z`, owner
  `24076314-d36f-44f1-a50f-4acc660b5d7b` (mahfuzh74@gmail.com).
- Its target: message `--Kd2qMkiLzY` — HIS bubble (`role: 'runner'`, "kasih hadiah foto") —
  session `ZhaNptlAM4GY`, 9th from the end of 17 messages, so comfortably inside the
  `CHAT_HISTORY_LIMIT = 200` render window (`app/nina/page.tsx:111`): both the scroll and the
  flash must fire for the exact case the user described.
- The next 7 of the top 8 jobs resolve to nothing (sessions deleted; the cascade took the
  messages) — they render the `gone` sentence, not the button, exactly as `planJobJump` documents.

**Impact:** none — SELECT only.

### Step 7: Build, then serve on a port that is not 3000

**File:** none
**Change:** production runs `origin/main`; the probe must run the real build, not dev.

**Code:**
```sh
cd /home/miftah/.worktrees/run-insights/job-jump-flash
npm run build
npx next start -p 3100   # background; port 3000 is held by an unrelated process that 302s to /login
```

Confirm it is OUR server answering: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/nina/jobs`
must be `307`/`302` to `/` (unauthenticated redirect from `requireUserId`), not the stranger's
`/login` answer.

**Impact:** a local prod server on 3100; kill it after Step 8.

### Step 8: The live end-to-end probe (R1's proof)

**File:** `.tmp-probe-jump.mjs` at the worktree root — created, run, then deleted. Never
committed (the phase owns no test files).

**Change:** drive the exact flow the user described — headless chromium, the owner's session,
`/nina/jobs` → top item → "Buka chat-nya" — and assert the landing. Playwright 1.62.x and
chromium are already installed (`playwright` is a devDependency; browsers are in
`~/.cache/ms-playwright`; if the revision mismatches after `npm install`, run
`npx playwright install chromium`). The session cookie is minted, not screen-scraped:
`auth.config.ts` chooses `strategy: 'jwt'`, so the session IS the cookie, and
`scripts/capture/session-cookie.mjs` is the repo's own, documented way to mint one (`token.sub`
is the only field that matters — `requireUserId()` scopes every query by it). The probe resolves
the owner and the top job from the database rather than hardcoding ids, so it survives data
drift.

**Code:** write `.tmp-probe-jump.mjs` with exactly this, then run
`node --env-file=.env.local .tmp-probe-jump.mjs`:

```js
import { chromium } from 'playwright'
import { neon } from '@neondatabase/serverless'
import { cookieNameFor, mintSessionCookie } from './scripts/capture/session-cookie.mjs'

const ORIGIN = process.env.PROBE_ORIGIN ?? 'http://localhost:3100'
const sql = neon(process.env.DATABASE_URL)

/* The same read listNinaImageJobs does: newest non-deleted image job, then its owner and its
 * live target — the read getNinaImageJobDetail performs to decide `jump.kind === 'ready'`. */
const jobs = await sql.query(`
  select id, user_id, args->>'replyToId' as reply_to_id
  from nina_turns where kind = 'image' and deleted_at is null
  order by created_at desc limit 10`)
const job = jobs.find((j) => j.reply_to_id)
if (!job) throw new Error('no top job with a live replyToId — the button would be the gone sentence')
const [user] = await sql.query(`select id, name, email from "user" where id = $1`, [job.user_id])
const [msg] = await sql.query(`select id, session_id from nina_messages where id = $1`, [job.reply_to_id])
if (!msg) throw new Error('target message gone — button is the gone sentence; no probe possible')
console.log(`PROBE top job ${job.id} → /nina?s=${msg.session_id}&jump=${msg.id} (owner ${user.email})`)

const cookie = await mintSessionCookie({ userId: user.id, name: user.name, email: user.email, origin: ORIGIN })
const TARGET_ID = `nina-msg-${msg.id}`
const browser = await chromium.launch()
const failures = []
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, // the phone shape the screen was designed at
      colorScheme: scheme,
    })
    await context.addCookies([{ name: cookieNameFor(ORIGIN), value: cookie.value, url: ORIGIN }])
    const page = await context.newPage()

    await page.goto(`${ORIGIN}/nina/jobs`)
    await page.click(`a[href="/nina/jobs/${job.id}"]`)
    await page.waitForURL(`**/nina/jobs/${job.id}`)

    /* (a) the landing URL carries ?s= AND ?jump= — the href IS the landing URL. */
    const href = await page.getByRole('link', { name: 'Buka chat-nya' }).getAttribute('href')
    const expected = `/nina?s=${msg.session_id}&jump=${msg.id}`
    if (href !== expected) failures.push(`(a) href ${href} !== ${expected}`)
    else console.log(`(a) PASS [${scheme}] href carries ?s= and ?jump=`)

    await page.getByRole('link', { name: 'Buka chat-nya' }).click()
    await page.waitForURL(`**/nina?s=${msg.session_id}*`)

    /* (b) after the landing, #nina-msg-<id> carries data-flash="true", the blink animation is
     * actually running, and the ring variable resolves to the scheme's --ink. data-flash lives
     * on the <li>; the ring variable and the animation live on the inner bubble div. */
    await page.waitForFunction(
      (id) => document.getElementById(id)?.getAttribute('data-flash') === 'true',
      TARGET_ID,
      { timeout: 15000 },
    )
    const flash = await page.evaluate((id) => {
      const li = document.getElementById(id)
      const div = li.querySelector('[data-nina-bubble-body]')
      return {
        animating: div.getAnimations().some((a) => a.animationName === 'nina-flash-blink'),
        ring: getComputedStyle(div).getPropertyValue('--nina-flash-ring-color').trim(),
      }
    }, TARGET_ID)
    const ink = scheme === 'light' ? '#1d2733' : '#f2f7fa'
    if (!flash.animating) failures.push(`(b) nina-flash-blink not running on the bubble div`)
    if (flash.ring !== ink) failures.push(`(b) ring var resolved to "${flash.ring}", expected ${ink}`)
    else console.log(`(b) PASS [${scheme}] data-flash=true, blink running, ring var = ${flash.ring}`)
    await page.screenshot({ path: `/tmp/jump-flash-${scheme}.png` })

    /* (c) resting position: after the hold (flashHoldMs(4) = 1600 ms) plus settle, the target
     * sits inside the readable band — bottom above the composer's top, top on screen — and the
     * one-shot semantics held: ?jump= consumed, ?s= survives. */
    await page.waitForFunction(() => !location.search.includes('jump='), null, { timeout: 5000 })
      .catch(() => failures.push(`(c) ?jump= never consumed by the strip effect`))
    await page.waitForTimeout(2500)
    const geo = await page.evaluate((id) => {
      const rect = document.getElementById(id).getBoundingClientRect()
      const composer = document.getElementById('nina-composer')
      return {
        top: rect.top,
        bottom: rect.bottom,
        composerTop: composer ? composer.getBoundingClientRect().top : window.innerHeight,
        query: location.search,
      }
    }, TARGET_ID)
    if (geo.top < -1 || geo.bottom > geo.composerTop + 1)
      failures.push(`(c) target outside the band: top=${geo.top.toFixed(0)} bottom=${geo.bottom.toFixed(0)} composerTop=${geo.composerTop.toFixed(0)}`)
    if (!geo.query.includes(`s=${msg.session_id}`)) failures.push(`(c) ?s= lost: ${geo.query}`)
    if (!failures.length)
      console.log(`(c) PASS [${scheme}] resting in band (top ${geo.top.toFixed(0)}, bottom ${geo.bottom.toFixed(0)} ≤ composer ${geo.composerTop.toFixed(0)}); ?jump= consumed, ?s= survives`)
    await context.close()
  }
} finally {
  await browser.close()
}
if (failures.length) {
  console.error('PROBE FAIL'); for (const f of failures) console.error('  ' + f); process.exit(1)
}
console.log('PROBE PASS — light and dark')
```

**What each assertion closes:**
- (a) proves the server-built href (`planJobJump` → `ninaJumpHref`) is the two-param deep link —
  the "no mechanism" theory is about what happens AFTER this URL opens.
- (b) proves the chain fires: `jumpRef` → mount effect → `landOn` → `flashMessage` → the
  `data-flash` attribute, the animation actually attached, and — R2 itself — the ring variable
  resolving to the scheme's `--ink` in the RUNNING app, in both schemes.
- (c) proves the landing is a pinpoint and not just a flash: the target rests in the band the
  composer leaves over, and the one-shot param semantics held (`?jump=` consumed, `?s=` alive).

The screenshots land in `/tmp/jump-flash-light.png` / `-dark.png` for the log. The visit writes
only the idempotent bookkeeping a normal visit writes (`markNinaMessagesRead`, the stale-job
sweep) — acceptable, said and accepted in the phase brief.

**If the probe fails:** do not ship the color and call R1 done. Diagnose with
systematic-debugging discipline — reproduce, read the failing link in the traced chain
(`ChatScreen.tsx`: `jumpRef` :421, strip effect :463-480, mount landing :777-788, `landOn` :751,
`flashMessage` :682; `MessageList.tsx:281,327`; `MessageBubble.tsx:440,484-486`), find root
cause, fix it in this phase (the phase's scope is R1 = the WORKING flow), and record root cause
and fix in the Verification Log below. A fix that must touch a file outside this phase's list
(`reply.ts`, `chatview.ts`, `jobview.ts`, `ChatScreen.tsx`, `MessageList.tsx`) is a finding to
record and hand off — but a genuine break in THIS chain is expected to be fixed here, because
there is no later phase to fix it in.

**Impact:** none on the repo once `.tmp-probe-jump.mjs` is deleted.

### Step 9: Gates, cleanup, commit

**File:** the three owned files, committed by pathspec.
**Change:** run the gates, clean the throwaways, commit.

**Code:**
```sh
cd /home/miftah/.worktrees/run-insights/job-jump-flash
rm -f .tmp-probe-jump.mjs
kill $(lsof -ti :3100) 2>/dev/null   # the Step 7 server is done; nothing of the phase keeps running
npm run lint
npx vitest run
npm run format             # repo-wide — see below
git status --porcelain     # MUST show exactly the three owned files, nothing else
git add components/nina/MessageBubble.tsx app/globals.css lib/nina/search.ts
git commit -- components/nina/MessageBubble.tsx app/globals.css lib/nina/search.ts -m "$(cat <<'EOF'
fix(nina): flash his bubbles in their own ink — and prove the jobs jump live

R2: the landing ring on his bubbles was #fff, a 2px white ring on light sky
paper — invisible exactly where a jobs deep link always lands (on a bubble of
his). It is now var(--ink), the bubble's own fill, per the 2026-09-10 ask that
supersedes 09-09's "jadi putih"; the three comments recording the decision are
rewritten with the supersession.

R1: the pinpoint+flicker chain was already fully wired and shared with search;
proven end-to-end against the real top job (xZoxXUCsWUzq → --Kd2qMkiLzY) in a
local prod build — href carries ?s=&jump=, the target bubbles data-flash=true
with the blink attached and the ring var resolving to --ink in both schemes,
and it rests in the readable band above the composer.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git show --stat HEAD        # read it: exactly three files, no strays
```

Notes the memories have already paid for: `npm run format` is repo-wide — HEAD is
prettier-clean, so after it `git status --porcelain` must name ONLY the three owned files; if it
names more, revert the strays before committing. Add by name, commit by pathspec, and read the
`--stat`. Do not run `npm run format` with the probe file still present.

**Impact:** one commit on `feature/job-jump-flash` containing exactly three files.

## Verification

**Build:** `npm run build` (Step 7 — also produces the server the probe runs against)
**Tests:** `npx vitest run` — must pass UNMODIFIED; `tests/motion.reducedMotion.test.ts` guards
the reduce keyframe by name-token and still-ness and asserts no color, so it cannot see this
change except through the file still compiling. `npm run lint` and `npm run format` (with the
`git status --porcelain` check) complete the gates.
**Manual check:** the probe is the manual check — `/tmp/jump-flash-light.png` must show his
bubble ("kasih hadiah foto") mid-blink with a dark ring around it on sky paper, `-dark.png` the
same landing on dark paper with a near-white ring (visually today's behavior).
**Exit criteria:** the class reads `[--nina-flash-ring-color:var(--ink)]`; her bubbles still
blink `--accent` (keyframe defaults untouched, `app/globals.css:291,303`); build, lint, vitest
green; format-clean tree with exactly three files in the commit; the probe prints
`PROBE PASS — light and dark` with (a), (b) and (c) PASS lines for both schemes, and the result —
pass or the root-caused fix — is recorded in the Verification Log below.

## Verification Log

(Filled in by the implementer — this phase is not done while this section is empty.)

```
Date/time: 2026-09-10, 09:47–09:54 WIB
Top job re-measured (Step 6): unchanged from analysis — xZoxXUCsWUzq (ok, 2026-09-10T01:50:02Z,
  owner mahfuzh74@gmail.com) → target --Kd2qMkiLzY, session ZhaNptlAM4GY, role runner,
  session_len 17, from_end 9 (in-window). Drift since 09:00: jobs 4–5 (TBYflEJGPMfd,
  xyzLWZds8jfP) now carry live replyToIds too; probe still resolves xZoxXUCsWUzq dynamically.
Probe output (Step 8, both schemes): PROBE PASS — light and dark.
  (a) PASS ×2  href = /nina?s=ZhaNptlAM4GY&jump=--Kd2qMkiLzY
  (b) PASS ×2  data-flash=true, nina-flash-blink attached,
               ring var = #1d2733 (light) / #f2f7fa (dark)
  (c) PASS ×2  resting in band (top 371, bottom 413 ≤ composer 783); ?jump= consumed, ?s= survives
Screenshots: /tmp/jump-flash-light.png, /tmp/jump-flash-dark.png — target mid-band, quote card
  below, composer clear; light shows the ink bubble on sky paper, dark as today's near-white.
Defects found & fixed (or "none"): none in the chain. Environment deviations, decided and
  recorded: probe port 3100 was held by a stranger (EADDRINUSE) → served on 3777 (plan's
  requirement "not 3000, our 307→/" met); plan Step 9's `git commit -- <paths> -m …` spelled -m
  after the pathspec separator (git rejects) → flags moved before `--`; repo-wide `npm run
  format` re-dirtied lib/nina/queries.ts + tests/db.schema.nina.test.ts — HEAD itself is
  prettier-dirty under the freshly installed prettier (verified by prettier-checking the HEAD
  blob in-repo) — strays reverted, not phase files.
Gates: build / lint / vitest / format → build PASS (route table, /nina/jobs present);
  lint PASS exit 0 (2 pre-existing warnings in scripts/capture/shoot.mjs, untouched here);
  vitest PASS 166 files / 3566 tests incl. tests/motion.reducedMotion.test.ts unmodified;
  format-clean among phase files, strays reverted per plan rule.
Commit: d269beed506f18768a65338482d68ac9dcb6aec9 — exactly the three owned files
  (45 insertions, 20 deletions).
```

## Handoffs

None — this is the set's only phase. Work found but deliberately out of scope, recorded in the
plan index and the analysis, not here: the `'quote-missing'` degradation for trigger messages
older than `CHAT_HISTORY_LIMIT` (200) — measured population zero among live jobs (the dead ones
are dead at the session level, not the window level); the three degraded jump sentences
(`avatar`, `no-message`, `gone`) — already honest. If the probe had exposed a break whose fix
must touch `lib/nina/reply.ts`, `lib/nina/chatview.ts`, `lib/nina/jobview.ts`,
`ChatScreen.tsx` or `MessageList.tsx`, record it here and in the plan index rather than fixing
it silently — but the expectation, per the analysis's link-by-link trace, is that there is no
such break.

## Rollback

`git revert` of the phase's single commit on `feature/job-jump-flash`, or abandoning the branch —
`origin/main` is untouched until a merge. The change is one class literal and three comment
blocks: no data, no schema, no env, nothing to migrate back. The probe left nothing behind (the
server is killed, `.tmp-probe-jump.mjs` deleted, screenshots are in `/tmp`).
