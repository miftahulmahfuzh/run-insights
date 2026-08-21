# F10 — Badge art generation skill

**Owns:** `.claude/skills/generate-badge/SKILL.md`, `.claude/skills/generate-badge/style.md`,
`tools/gen_badge_art.py`, `tools/check_badge_art.py`, `tools/make_badge_assets.py`, and the
22 generated patches under `assets/badges/`.

**Depends on:** F09 (badge catalog only — `lib/badges/catalog.ts` must exist and be stable
before any money is spent). Last in build order for exactly that reason: F10 spends real
dollars and real wall-clock time per image, and the one thing that must not move under it is the
set of 22 keys.

**Reads:** `ROADMAP_v0.1.0.md` §4.1 (environment / key hygiene), §4.6 (badge catalog, the 22
keys), §4.7 (art style direction), D12 (offline generation, committed, no runtime image calls).
**Descends from:** `/home/miftah/daily-words/.claude/skills/generate-badge-art/{SKILL.md,style.md}`
and `/home/miftah/daily-words/tools/{gen_badge_art.py,check_badge_art.py}` — read in full before
this plan was written, and referenced throughout by section.

This plan does not touch roadmap §4.6 or §4.7. No `## Contract deltas` section follows because
none is needed: §4.6 already lists exactly 22 keys, one per scene line below, and §4.7's
seven axes are fully specified in the style block below without contradicting anything the
roadmap says. Where this plan makes a choice the roadmap left open — thread hex values, the
outer-silhouette-shape assignment, the skill's exact file layout — that is this plan's job to
decide, not a delta to record.

---

## 0. The one sentence that governs everything below

**Same craft, opposite medium.** Every constraint the reference deck earned the hard way — no
text, full bleed, one silhouette, one subject, an anchor image, nine measurements, three
attempts, LOOK AT IT before judging — survives untouched, because none of those are about ink
and paper. Everything that *is* about ink and paper — the STYLE BLOCK's prose, the palette
tokens `check_badge_art.py` measures against, the ring-detection geometry, the "old paper" drift
warning — is rebuilt from nothing, because a navy twill patch with five saturated threads fails
half of those checks by construction if they are merely copied.

---

## 1. What changes and what doesn't, at a glance

| | daily-words (`generate-badge-art`) | run-insights (`generate-badge`) |
|---|---|---|
| Medium | ink printed on paper | thread embroidered on fabric |
| Substrate | flat cream card, `#F0EDE4` | dark navy cotton twill, visible weave, `#1B2A44` |
| Palette | 2 flat inks (`#2F5D50` + `#8A3324`) | 5 saturated threads + 1 signature thread (hexes in §4) |
| Technique | engraved line, hatch, stipple | satin stitch, chain-stitch contour, merrowed border |
| Silhouette | circle in a square, always | shield / hexagon / chevron / rounded triangle, varies per badge |
| Light | none, flat | one hard raking light, upper left, thread sheen |
| Tone | dry, clerical, fond | loud, sporty, a little absurd |
| Deck size | 22 (grown over months) | 20 (fixed set, generated in one project phase) |
| Provider | OpenRouter *or* OpenAI, a `--provider` flag | **OpenRouter only** — the roadmap header pins `qwen/qwen-image-3-pro`, so the two-provider abstraction is dead weight here and is deliberately dropped (§5.1) |
| Decks per tool | two (`--kind badge` / `--kind level`) | **one** — run-insights has no `levels.ts` equivalent, so `--kind` is dropped too |
| Loop, attempt cap, LOOK AT IT, anchor discipline, key hygiene | — | **unchanged, verbatim** |

The loop, the attempt cap, the anchor discipline and the key hygiene are not style. They are
craft, and craft carries over exactly. Sections 2–4 rebuild the style; section 5 carries the
scripts across with the two simplifications in the table above and the measurement rebuild
§6 requires; sections 7–10 are the parts that are pure process and need no invention at all.

---

## 2. The complete draft `SKILL.md`

```markdown
---
name: generate-badge
description: Generate and grade one embroidered badge-patch image for Run Insights' badge shelf via OpenRouter. Use when asked to generate, regenerate or iterate on badge art — e.g. "/generate-badge early_bird", "regenerate the sandbagger patch", "the gremlin badge is unreadable at 40px", "make a patch for the new badge key" — or whenever a key is added to BADGE_CATALOG and needs art. Handles the whole loop: prompt assembly from the locked style contract, generation against the deck anchor, measurement, and visual judgement at the sizes the app actually draws.
---

# Generate badge art

One badge per invocation. **Never a batch loop in one call** — the three-attempt cap and the
look-at-it step are per badge, and a loop makes both ceremonial. At ~$0.04 and 4–5 minutes per
generation, a batch loop is also real money and real wall-clock time spent before a human has
looked at any of it (§8).

The art style, the 22 scenes and the reasoning behind them live in `style.md` next to this
file. The full design record is `docs/plans/F10-badge-art-skill.md`. Read `style.md`; read the
plan only when you are about to change the style.

## The loop

### 1. Resolve the key

The user may give a key (`early_bird`), a title ("the Sandbagger badge"), or a description ("the
gremlin one"). Resolve it to exactly one key in `BADGE_CATALOG` in `lib/badges/catalog.ts`. If it
resolves to more than one or to none, ask — do not guess, because a wrong key spends money on the
wrong picture.

If the key is in `BADGE_CATALOG` but has no line inside `<!-- SCENES -->` in `style.md`, stop and
say so. `gen_badge_art.py` will refuse to start anyway; you should say why before it does.

### 2. Find the anchor

```bash
ls assets/badges/_anchor.png
```

- **Present** → every generation uses `--reference assets/badges/_anchor.png`. This is not
  optional. 22 badges must share one twill tone, one merrowed-border weight, one satin-stitch
  gauge and one raking-light direction, and every one of those is a continuous quantity a text
  prompt specifies loosely and an image specifies exactly.
- **Absent** → you are generating the anchor. §8 of this skill's design plan recommends
  `early_bird` for the anchor run — it is a shield, it exercises two of the five main threads
  plus the signature thread, and its subject (a rooster against a sun disc) is simple enough to
  judge cleanly before the harder subjects are attempted. If the user asked for a different key
  with no anchor on disk, say that the set has no anchor yet and ask whether to make *this* badge
  the anchor or to do `early_bird` first. **Say in your report that this was an anchor run**,
  because the operator has a promotion to perform that they do not have on any other run.

### 3. Generate

```bash
python3 tools/gen_badge_art.py <key> [--reference assets/badges/_anchor.png]
```

Writes `assets/badges/_candidates/<key>.aNN.png` and a `.txt` sidecar holding the exact prompt,
the model, the seed, the style version and the reference used. The sidecar is why a candidate you
like six weeks from now can be explained.

**One provider, one model, pinned by the roadmap.** `qwen/qwen-image-3-pro` via OpenRouter —
there is no `--provider` flag here, unlike the daily-words tool this descends from. That tool
carries a two-provider table because its deck was built by hand across an OpenAI-then-OpenRouter
migration; this deck was never on OpenAI, so the table would be dead code that still had to be
kept honest. If a second provider is ever needed, port the table back in at that time rather than
carrying an unused branch now.

`--seed` is honoured — masters are reproducible. `--dry-run` assembles and prints the prompt
without reading the key, touching the network or writing a file; use it whenever you have edited
`style.md` and want to see what would be sent.

### 4. Measure

```bash
python3 tools/check_badge_art.py assets/badges/_candidates/<key>.aNN.png
```

Ten measurements now, not nine — §6 of the design plan adds one with no analogue in the
reference tool, because "flat printed graphic" instead of "actually stitched" is this style's
single most likely quiet drift, and it deserves its own number. Hard checks set the exit code;
advisory ones only print. It also writes the three files step 5 needs.

**Do not tighten a band because one candidate missed it.** The bands ship as gross-failure
catches, most of them re-derived by *guess* rather than by observation because this deck starts
from zero images — there is no thirteen-badge distribution to draw a band from yet, unlike the
tool this descends from. **Do not treat that as license to tighten anything before six badges are
approved and the bands can be re-derived from a real distribution**, exactly as the reference
tool's own header insists. A threshold that fails on something harmless is a threshold somebody
comments out.

### 5. LOOK AT IT

`check_badge_art.py` writes three files beside the candidate. **Read all three with the Read tool
before forming any opinion.**

- `<name>.themes.png` — a contact strip: the badge at **40 px and 220 px**, against two
  background swatches. **Judge from this strip. Do not judge a badge from the 1024 master** — at
  1024 every stitch looks considered, and the app never draws it at 1024.
- `<name>.ring.png` — the merrowed border and the outer inch of the interior, unrolled, at 3×,
  which is where lettering hides. (Kept the reference tool's name for this crop because its job
  is identical — read it that way even though there is no ring anymore, a shield's edge included.)
- `<name>.centre.png` — the subject at 2×, which is where anatomy hides.

Then judge in this order, because the order is roughly the frequency of failure:

- **Any lettering at all?** Instant reject. Real 1970s patches are covered in arced rocker text,
  club initials and dates — this training prior is if anything *stronger* here than it was for
  the reference's letterpress seal, because "patch" as a training concept comes overwhelmingly
  bundled with a club name across the top. Read `<name>.ring.png` at full size, all the way
  round. *Nothing measures this* — there is no OCR here, and the merrowed border's own texture
  (dense, regular, zigzag) is the one cheap proxy that is blind by construction, for the same
  reason the reference's lozenge-and-dot band was.
- **Is it a shoe, a medal, or a stopwatch?** None of the 22 scenes in `style.md` calls for any
  of the three objects a "running app achievement badge" prompt gravitates to regardless of what
  is actually asked for. Seeing one means the model ignored the scene, not that it satisfied it.
  Reject and re-state the scene's actual physical object in `--note`.
- **Does it read at 40 px?** Look at the first cell of the theme strip and nothing else for a
  moment. At shelf size a badge is a silhouette — specifically, the *outer shape* (shield, hexagon,
  chevron, rounded triangle) plus one high-contrast interior mass. If you cannot tell the outer
  shape and the interior mass apart from the badge above it, it has failed, regardless of how
  good it is at 220.
- **Is it actually stitched, or has it become a flat printed graphic?** The single most likely
  quiet failure of this style, the exact way "old paper" was the reference deck's. Zoom into
  `<name>.centre.png`: every filled area should show ridge-and-valley satin-stitch rows with a
  highlight on one edge and a shadow on the other from the raking light. A smooth, poster-flat
  fill with no stitch direction is off-brief even when the drawing is otherwise correct, because
  it is the treatment that photographs as a sticker, not a patch.
- **Is the twill the app's twill?** The most likely quiet colour drift is toward black, toward a
  desaturated grey, or toward a *printed*-looking flat navy with no weave grain at all. Hold the
  theme strip's margin against `#1B2A44` and squint for the diagonal weave texture — a smooth flat
  navy rectangle is not this substrate even if the hex number matches.
- **Does it repeat another badge's subject?** The twill, the merrowed border and the five-plus-one
  thread palette are shared by design; the interior is not. **Keep a running tally across the
  set** by category, not just by object: how many badges now centre on a creature perched on
  something, a vertical post standing alone, a single light source, a liquid drip? §4's collision
  audit names the adjacencies already checked at design time — read it before generating anything
  past the badge you are on, because a convergence noticed on badge sixteen is a convergence that
  cost fifteen badges of hindsight.
- **Does the signature thread read as a second pass?** One small satin-stitch mark, in the one
  colour (`#F2600C`, described in the style block) that appears nowhere else on the badge. If it
  has become the colour of the whole subject, an outline, a second subject, or more than one mark,
  it has stopped being a signature.
- **Is the outer shape the one this badge was asked for?** Image models default an "embroidered
  patch" request to a circle in a square, which is exactly the reference deck's silhouette and
  exactly the shape this style forbids. Confirm the shape named in the scene line — not a circle,
  never a circle — before judging anything else about the interior.
- **Is the occasion legible without words?** The shelf shows the mark and the title; the panel
  shows the explanation. But a badge that needs the sentence to be understood at all has failed
  the picture's own job. Could someone who has never seen this app guess that `sandbagger` is
  about taking it easy?
- **Any radiating-line subject reading as a glyph or a starburst?** `new_ceiling`'s splinters are
  the one scene in this deck built from lines radiating out of a centre point. Check it does not
  resolve into an asterisk, a compass rose, or a rank star — all three are things this training
  distribution reaches for on a radiating pattern, and a rank star in particular is exactly the
  "award" register the style block forbids.
- **Is it an award?** Trophies, ribbons, rosettes, laurel, cups, crowns, medals, stopwatches,
  running shoes, ticks. None of these is the world this deck lives in.
- **Is it actually good?**

### 6. Revise, at most three attempts

An attempt is one generation. On rejection, say concretely what failed and pass a correction
through `--note "…"`, which is appended to the prompt after the scene line. Revise with
**positive, physical language**: name what the picture should be, not what it should stop being.
Every negative you write is a noun the model has now been told to think about.

If a scene is structurally wrong rather than badly executed — the subject cannot hold a
silhouette at 40 px, or it keeps colliding with another badge, or the outer shape keeps reverting
to a circle no matter how the prompt is worded — **stop and propose a `style.md` scene edit**
rather than spending the third attempt. A scene line is cheap to change and an attempt is not.

If three attempts fail on lettering specifically, say so plainly in the report and do not start a
fourth. That is a structural problem — the object itself sits too close to "team patch with a
name on it" in the training distribution — and the fix is a different silhouette or a different
subject, decided by a human, not a fourth roll of the same prompt.

### 7. Report

- the winning candidate's path
- its measurements, and any band it missed
- the theme strip, and what you saw in it
- what was rejected and why
- the attempt count
- the two suggested human acts (below)

## What this skill deliberately does not do

Three things, because each is a decision and none is undone by re-running a script.

- **It never writes to `assets/badges/`.** That is source art. Promotion of a candidate is a
  human act; suggest it and stop:

      cp assets/badges/_candidates/<key>.aNN.png assets/badges/<key>.png
      cp assets/badges/_candidates/<key>.aNN.txt assets/badges/<key>.txt

  **Both files, always.** `make_badge_assets.py` reads the style version out of the sidecar, and
  it reads it from there rather than from `style.md` on purpose: taking the current version would
  stamp every badge "the version now" and make a mixed deck undetectable, which is the one thing
  the version stamp exists to catch. A master with no sidecar is recorded `"unknown"` and warned
  about.

  `_candidates/` is gitignored and is where every attempt lives, with its exact prompt beside it.

- **It never sets the anchor.** Approving one badge as the reference for the other nineteen is
  the highest-leverage decision in the whole feature and it is made once. Suggest it and stop,
  after the promotion above:

      cp assets/badges/early_bird.png assets/badges/_anchor.png

  (or whichever key was actually approved first — the anchor is decided by which badge is
  approved first, not hardcoded to a name).

- **It never runs `tools/make_badge_assets.py`.** That regenerates `public/badges/**` and
  `lib/badges/badge-art.ts` — it changes what ships. Because filenames are content-hashed the
  change is *safe*, but it is still a change to the shipped app made from inside an
  art-generation loop, and it belongs in its own commit alongside a `npm run badges:check` run.
  Flag it and let the operator sequence it.

## The one thing that must never happen

`OPENROUTER_API_KEY` is read by `tools/gen_badge_art.py` and by nothing else. **No application
code may read it** — not `LLM_API_KEY`, not `LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */`, `lib/env.ts` has no entry for
it, and

    grep -rE 'OPENROUTER_API_KEY' app/ lib/ components/

must stay empty. `npm run badges:check` asserts that emptiness in CI (§7 of the design plan).

Never print the value, never echo it into a report, never paste it into a file. The tool prints
*which source* it came from and not what it is.
```

---

## 3. The complete draft `style.md`

```markdown
# The badge deck's style contract

Read by `tools/gen_badge_art.py`, which parses this file — the fences, the
`<!-- STYLE BLOCK vN -->` markers and the `- <key>: <scene>` line format are an **interface, not
decoration**. One file a human edits and a script reads, so the prompt that was sent can never
drift from the prompt that is documented.

**Bump the version when you change the style block.** Every badge carries its version in its
`.txt` sidecar and in the generated manifest, so a mixed set is detectable rather than merely
suspected.

## What the parser takes from this file

| Region | Delimiters | Used for |
|---|---|---|
| The style block | `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->` | Sent verbatim with every badge. `N` becomes `styleVersion`. |
| The scenes | `<!-- SCENES -->` … `<!-- /SCENES -->`, lines matching `- <key>: <scene>` | One line appended per badge as `SUBJECT FOR THIS BADGE:` |

**A marker only counts when it is alone on its own line.**

`gen_badge_art.py` refuses to start unless the set of keys inside `<!-- SCENES -->` is exactly the
set of keys in `BADGE_CATALOG` in `lib/badges/catalog.ts`. A scene line with no badge, or a badge
with no scene line, is a startup error rather than a surprise 22 images later.

---

## The style block

Sent identically with every single badge.

```
<!-- STYLE BLOCK v1 -->
A single embroidered cloth patch, sewn onto a scrap of dark navy cotton twill, in the manner of a
1970s amateur running-club jacket patch — the kind a local road-race club had made by the gross
and stitched onto windbreakers.

FULL BLEED — THIS IS THE MOST IMPORTANT RULE. The navy twill fills the entire image, edge to edge
and corner to corner, with the patch sewn onto it. Do not render a photograph of a patch sitting
on a table, on a jacket sleeve, on a felt board, in a flat-lay with scissors or a spool of thread
beside it, held in a hand, pinned to a corkboard, or inside a product-mockup frame. No hoop, no
embroidery machine, no shadow cast onto a surface behind the fabric, no vignette, no rounded
photo corners, no white margin. The image IS the twill, and the patch IS sewn onto it — nothing
else exists in the frame.

NO TEXT ANYWHERE. No club name, no arced rocker text across the top, no motto, no date, no
number, no initial, no monogram, no size label, no maker's tag, no glyph or mark in any alphabet.
Real patches of this kind are covered in lettering; this one carries none. The application prints
the title beneath the picture. Any text is an automatic rejection, and lettering is the single
likeliest reason this style burns an attempt — check the merrowed border and the interior both.

SUBSTRATE: dark navy cotton twill, near #1B2A44, with a visible diagonal weave — the fabric's own
grain must read under the raking light as fine, regular texture, not a flat digital navy fill. A
generous margin of bare twill surrounds the patch on every side, the same fabric on all 22
badges, so the set reads as one bolt of cloth cut 22 times.

THE PATCH: one solid embroidered shape, centred, occupying about 80 percent of the image width.
Its outer silhouette is load-bearing and is named per badge below — a shield, a hexagon, a
chevron, or a rounded triangle — and it is never a plain circle in a square, which is the shape
every generic "embroidered patch" defaults to and the one shape this deck must never produce. Its
edge is a merrowed border: a thick, rounded, rope-like band of tight overlock zigzag stitching in
bone-white thread, the one element every one of the 22 badges shares exactly, at the same
gauge and the same width. Inside that border sits this badge's own subject, alone, filling most of
the interior with generous room at the corners.

THREAD: five saturated colours, laid as dense machine embroidery, and nothing else.
  - Cardinal red, near #C23B2E
  - Kelly green, near #2E7D46
  - Marigold gold, near #E3A72E
  - Bone / cream, near #EDE3C8 — carries the merrowed border and any bright highlight row
  - Slate sky blue, near #4C8FB0 — used sparingly; the navy substrate already reads as the "blue"
    of the piece, so this colour appears only where a subject specifically needs a cool note,
    never as a background wash
Each badge draws its subject from two or three of these five — never all five in one badge, and
never fewer than two, or the patch reads as flat rather than embroidered.

THE SIGNATURE THREAD: one colour outside the five above — a bright safety-orange bullion thread,
near #F2600C — worked as a single small satin-stitch accent on every badge and nowhere else: the
raised, glinting mark that is this deck's one wildly out-of-register colour, the way a second
pass through a press leaves one mark slightly off true in the deck this style descends from. It
never fills the whole subject, never becomes an outline, and never appears twice on the same
badge. Where it goes is named per badge below, and it is the one thing about each badge that is
genuinely singular.

TECHNIQUE: dense satin stitch for every filled area — parallel rows of thread laid edge to edge,
thick enough to sit proud of the twill and cast their own thread-width shadow. Fine contour and
internal linework is chain stitch, laid in one unbroken continuous line, never a dotted or broken
run — a broken run of small stitches reads as a row of letters at 40 px, which is the exact
failure this rule exists to prevent. No cross-stitch, no French knots, no fringe, no sequins, no
visible felt applique beneath the thread, and no flat printed or vector-look fill anywhere — every
surface must show the ridge-and-valley texture of individual stitch rows. A flat, smooth,
poster-like fill is the single most likely quiet failure of this style, the exact way "old paper"
was the reference deck's: if a passage looks airbrushed rather than stitched, it has drifted out
of the contract even when the drawing is otherwise correct.

LIGHT: one hard, raking light from the upper left, low and directional, the way a patch
photographed for a catalogue is lit to sell its texture. Every satin-stitch row throws a thin
bright highlight on its lit edge and a thin core-shadow on its dark edge; the whole patch casts
one soft, close contact shadow onto the twill immediately around its own merrowed border — never
a floating drop shadow, never a shadow implying distance from the cloth. The sheen is thread
sheen: a slight directional gloss along each row's lit edge, not a painterly glow and not a
metallic bevel.

TONE: loud, sporty, a little absurd — a patch a running club had made as an inside joke and wore
anyway. It contains no trophies, no laurel wreaths, no ribbons, no rosettes, no cups, no crowns,
no medals, no stopwatches, no running shoes, and no ticks. Those seven objects are the default a
request like this pulls toward regardless of what is actually asked for, and none of the 22
subjects below is any of them; seeing one in a candidate means the model ignored its scene, not
that it satisfied it.

READ AT FORTY PIXELS. The application draws this forty pixels wide on a shelf and about two
hundred and twenty in a panel. One bold, unmistakable outer silhouette, one high-contrast interior
mass, heavy stitch rows that survive the reduction, and no detail — no fine chain-stitch flourish,
no thread-count texture — that exists only at full resolution.

ONE SUBJECT, ITS OWN SUBJECT. The twill, the merrowed border, the five threads and the one
signature thread belong to the whole set; what sits inside the border belongs to this badge alone.
Do not fall back on a running shoe, a medal, or a stopwatch as a default centre — 22 patches
converging on the same three objects is the way this set fails.
<!-- /STYLE BLOCK -->
```

---

## The scenes

One line per badge, appended to the style block as `SUBJECT FOR THIS BADGE:`. Each names a
**distinct central object and a distinct internal geometry**, an **outer silhouette shape**, and
**where the single signature thread goes** — the run-insights equivalent of the reference deck's
"where does the vermilion mark go," and for the same reason: a mark that lands in the same
relative place 22 times stops being a second pass and starts being a logo.

Three rules carried over unchanged from the deck this skill descends from:

**Say what the picture IS.** Every negative you write is a noun the model has now been told to
think about. The style block carries the negatives it must; the scene lines carry none.

**Describe a pose, never count body parts.** `groundhog_day`'s "both forepaws braced flat on the
rim" fixes the arrangement without enumerating anything; an instruction like "two front paws,
correctly formed" reads as anatomical enumeration and produces worse results, not better ones.

**Avoid faces of numbers and faces of clocks.** Anything with a dial invites numerals, and
numerals are text. Not one of these 22 scenes uses a clock, a watch face, a gauge or a scale
for exactly this reason — `late_start` and `warmup_who` both name lateness/urgency without a
timepiece anywhere in the deck.

A fourth rule, new to this deck because the medium is new: **describe the stitch, not just the
subject, wherever a flat fill is the likely failure.** A doughnut or a piggy bank rendered as a
smooth 3D render is a plausible, wrong answer to every one of these lines; the style block's
TECHNIQUE paragraph carries that weight so the individual scene lines don't have to repeat it.

```
<!-- SCENES -->
- early_bird: A single rooster in profile on a fence rail, neck stretched fully forward and beak lifted into a plain rising sun disc that sits directly behind its head, the comb a small stitched crest along the skull. SHAPE: shield. SIGNATURE THREAD: the sun disc's rim, one continuous bright ring behind the rooster's head.
- late_start: A single sunflower long past its bloom, head drooped heavy on a bent stem, one wilted petal already fallen and lying below it. SHAPE: hexagon. SIGNATURE THREAD: the one fallen petal, stitched apart from the flower's own thread.
- self_reward: A single glazed doughnut lying flat, one large bite already taken from its edge. SHAPE: shield. SIGNATURE THREAD: the ring of glaze right at the edge of the bite, where the crumb shows through.
- negative_split: A single comet crossing the patch on the diagonal, its tail a wide fan of parallel stitched lines at the trailing end, narrowing along its length to one small bright point at the head. SHAPE: chevron. SIGNATURE THREAD: the comet's head, the one point the whole tail narrows into.
- metronome: A single wooden metronome case in profile, pyramidal body, its pendulum arm standing frozen dead upright at centre with one plain sliding weight part-way up it. SHAPE: rounded triangle. SIGNATURE THREAD: the sliding weight on the pendulum arm.
- fast_start_fool: A single wooden matchstick lying at a slight diagonal, its flame already collapsed to a last low ember at the tip and one thin curl of smoke lifting off it. SHAPE: hexagon. SIGNATURE THREAD: the last ember at the matchstick's tip.
- redline_republic: A single flag flying stiff and flat from a bare pole planted alone, its fly end torn into three ragged points by the wind. SHAPE: rounded triangle. SIGNATURE THREAD: a short fresh tear at the base of the flag's middle point.
- sandbagger: A single sloth hanging by one raised arm from a bare horizontal bar, its other three limbs and its head all hanging loose and unbothered. SHAPE: shield. SIGNATURE THREAD: one small flower tucked behind the sloth's ear.
- cadence_collapse: A single wooden step-ladder shown mid-collapse, its legs buckled outward at the hinge and its top step tipping hard to one side. SHAPE: chevron. SIGNATURE THREAD: the hinge pin at the exact point the legs have given way.
- warmup_who: A single fire hydrant standing alone, its cap already knocked loose and a solid jet of water blasting straight up out of it, no valve wheel or bonnet bolt shown on its body. SHAPE: rounded triangle. SIGNATURE THREAD: the knocked-loose cap, tumbling just clear of the jet.
- groundhog_day: A single groundhog shown from the shoulders up, popping out of a round burrow hole with both forepaws braced flat on the rim. SHAPE: hexagon. SIGNATURE THREAD: the groundhog's nose.
- tourist: A single signpost with three blank arrow-shaped boards fixed to it at different heights and angles, every board bare of any word. SHAPE: chevron. SIGNATURE THREAD: the tip of whichever board points furthest from the other two.
- century_club: A single fence post wrapped in one thick, tightly wound ball of coarse thread, the loose tail end trailing off the ball and down across the ground. SHAPE: shield. SIGNATURE THREAD: the trailing tail end of the wound thread.
- double_century: Two identical bare posts standing apart, joined by one long line of bunting strung between them and sagging in a single deep curve at its lowest point. SHAPE: rounded triangle. SIGNATURE THREAD: the lowest point of the sagging curve.
- half_ish: A single full moon shown exactly half lit and half in shadow, one hard straight line dividing the bright half from the dark half down the centre. SHAPE: hexagon. SIGNATURE THREAD: the dividing line itself, running from the moon's top edge to its bottom.
- sweat_equity: A single round piggy bank standing alone, one heavy bead of sweat forming at its snout, its back entirely bare of any slot or mark. SHAPE: chevron. SIGNATURE THREAD: the bead of sweat at the snout.
- new_ceiling: A single wooden ceiling board shown burst open from beneath, a ragged round hole punched clean through its centre with splinters radiating outward from the break. SHAPE: shield. SIGNATURE THREAD: the innermost ragged edge of the hole.
- consistency_gremlin: A single small gremlin, pointed ears and a wide grin, astride a tower of four identical stacked blocks, its tail curled once around the tower's base. SHAPE: rounded triangle. SIGNATURE THREAD: the tip of the gremlin's curled tail.
- dawn_patrol: A single lighthouse tower standing alone, one hard-edged wedge of beam swept out sideways from its lamp room across the dark. SHAPE: shield. SIGNATURE THREAD: the beam itself, the one wedge of light in the whole patch.
- long_way_home: A single paper map shown folded open, its crease lines plain, one stitched route running the whole width of it from the bottom corner to a single pin dropped at the far corner. SHAPE: rounded triangle. SIGNATURE THREAD: the pin at the route's end.
<!-- /SCENES -->
```

Shape distribution, recorded rather than left implicit: **shield** × 6 (`early_bird`,
`self_reward`, `sandbagger`, `century_club`, `new_ceiling`, `dawn_patrol`), **hexagon** × 4
(`late_start`, `fast_start_fool`, `groundhog_day`, `half_ish`), **chevron** × 4
(`negative_split`, `cadence_collapse`, `tourist`, `sweat_equity`), **rounded triangle** × 6
(`metronome`, `redline_republic`, `warmup_who`, `double_century`, `consistency_gremlin`,
`long_way_home`). Uneven on purpose — real patch collections repeat shapes — but no two badges
flagged as adjacent in the audit below share a shape.

### The collision audit

Done at design time so the judge has a baseline to check against, rather than noticing
convergence on badge sixteen:

rooster-and-sunrise / wilted sunflower / bitten doughnut / diagonal comet / metronome / spent
match / torn flag / hanging sloth / collapsing step-ladder / hydrant jet / groundhog-in-burrow /
blank signpost / yarn-wound post / bunting between two posts / half-lit moon / sweating piggy bank
/ burst ceiling board / gremlin-on-blocks / lighthouse beam / folded map-and-pin.

**No shoes, no medals, no stopwatches, checked against all 22.** A "running app achievement
badge" prompt gravitates to exactly these three objects regardless of the scene it is given —
they are the training distribution's default answer to "draw a badge for a runner" the way an
open book was the reference deck's default answer to "draw a badge for a word game." None of the
22 subjects above is a shoe, a medal or a stopwatch, and the style block names all three
directly so that a candidate reaching for one is flagged as ignoring its scene rather than merely
disliked.

**The post: three badges use a vertical post as base furniture.** `redline_republic` (a flag on a
bare pole), `century_club` (a fence post wound in yarn) and `double_century` (two posts joined by
bunting) all stand something upright and alone. Three uses of the same understructure is at the
edge of tolerable, and they are kept distinct because the post is never the *subject* in any of
the three — the torn fly, the wound ball, and the sagging bunting curve are what the eye lands
on, and each of those three silhouettes is unlike the other two. If a future revision needs one
changed, `century_club` is the one to move: the wound-yarn ball reads as a subject in its own
right even without the post, and the prepared alternative is the same ball resting loose in a
wooden crate.

**century_club / double_century is a deliberate escalation pair, like `full_week`/`year_end` in
the reference deck, and it is watched the same way.** They share a theme (accumulated distance)
and a base object (a fence post) but not a silhouette — a compact wound ball against a long
sagging line. If they converge in generation, `double_century` is the one to change; a single
post strung with two full loops of bunting circling it, rather than two posts joined by one line,
is the prepared alternative, and it keeps the "double" reading.

**groundhog_day / consistency_gremlin: two creatures on/in something round-adjacent, checked and
separated on purpose.** `groundhog_day` is a bust — shoulders up, emerging from a hole, paws
braced on the rim, a hexagon. `consistency_gremlin` is a full body — perched astride a stacked
tower, tail curled around the base, a rounded triangle. Different posture (emerging vs. perched),
different shape, and a hexagon reads as a soft round opening while a rounded triangle reads as a
stacked, blocky mass — the two silhouettes should not converge at 40 px, but this is the pair to
re-examine first if any convergence is reported.

**late_start was drafted first as a snail leaving a stitched trail, and it was rejected before
generation.** `long_way_home`'s folded map already carries the deck's one winding-route line, and
a snail's trail is the same graphic idea — a thin looping line crossing the patch — attached to a
different animal. Two winding-line badges is a real collision risk the way two open-books were in
the reference deck, so `late_start` was rewritten to a wilted sunflower before a single image was
generated, and the snail is recorded here so nobody reintroduces it as a "fix" for some other
badge later.

**self_reward and sweat_equity both originally used a dripping bead as the signature thread.**
The doughnut's glaze and the piggy bank's sweat are visually distinct objects — a ring shape
against a rounded-body-with-ears shape — so the collision, such as it is, was never in the
silhouette; it was in the *habit* of reaching for "one drop" as the default signature-thread event
whenever a scene doesn't obviously suggest one. `self_reward`'s signature was moved to the glaze
edge at the bite instead, specifically so this deck does not open with two liquid-drop signatures
in its first 22 badges — a habit worth naming even though, at 40 px, neither drip would have
been visible either way.

**Three "light source" badges, tallied rather than treated as a collision.** `early_bird` (a sun
disc, a full circle), `fast_start_fool` (a match ember, a single point) and `dawn_patrol` (a
lighthouse beam, a wedge) all involve light. They are not flagged for change because their
silhouettes are unlike in the way that matters — a disc, a point and a wedge read as three
different shapes at 40 px — but a fourth light-source badge should not be added to this deck
without checking this note first.

**new_ceiling's radiating splinters are the deck's one burst pattern, and it is the pair to watch
against a rank star.** A "lines radiating from a centre" instruction is exactly how a five- or
six-point star gets drawn by reflex, and a star is the "award" register the style block forbids
outright. The line is written as "splinters radiating outward from the break" rather than "a
burst of lines," specifically to keep the picture reading as broken wood rather than an
insignia; if a candidate resolves it into a star anyway, the correction is `--note`d as "irregular
splintered wood, not a symmetrical star," never as a request to remove the radiating pattern
altogether, which would also remove the reason the hole reads as *broken*.

---

## Where this style came from

Roadmap §4.7 drew the boundary: **a vastly different medium from `daily-words`, not vastly
different scenes.** The seven axes in that section — medium, substrate, palette, technique,
silhouette, light, tone — are the seven paragraphs of the style block above, in the same order,
so the block can be checked against the roadmap line by line.

The five main threads and the one signature thread are not drawn from any existing run-insights
design token, because none exist yet at the time this plan is written — F01 has not shipped
`app/`, `lib/env.ts` has no theme, and `docs/design-brief.md` is a prompt waiting to be pasted
into Claude Design, not a token file. This is the one place this deck's palette deliberately does
**not** imitate the reference deck's practice of drawing its ink from `tokens.css`: the badge
shelf is specified in §4.7 to look nothing like the calm, literate reading-app chrome around it —
"loud, sporty, a little absurd" is explicitly not the app's own voice — so tying its palette to
whatever Claude Design eventually produces for buttons and cards would undercut the one design
decision the roadmap was most explicit about. If a future session wants the badge palette to nod
at the app's real accent colour once one exists, that is a v2 style block and a deliberate choice,
not a default.

Full argument for the script rebuild is §6 and §7 of `docs/plans/F10-badge-art-skill.md`.
```

---

## 4. Design notes behind the style block (not sent to the model, kept here for a future editor)

A few decisions above are load-bearing enough to explain once, outside the fenced blocks the
scripts parse:

- **Why five threads plus a signature, not four.** §4.7's table says "4–5 saturated thread
  colours." Five gives each scene a real choice (two or three of five, never all five) without
  making any one thread do too much work across 22 badges — the reference deck's two-ink
  economy works because a seal is small and simple; a satin-stitch patch with real interior detail
  needs more colour vocabulary to avoid every badge reading as a silhouette in one flat hue.
- **Why the signature thread is a colour used nowhere else, rather than one of the five used
  sparingly.** The reference's vermilion is not "the green, used sparingly" — it is a second ink
  entirely, which is what makes it read as a second pass rather than a shading choice. Reusing
  one of the five main threads as the "signature" would make the signature invisible against its
  own colour family; a sixth, reserved colour is the only way the mark stays legible as *the*
  mark.
- **Why bone/cream carries the merrowed border on every badge, unconditionally.** The reference
  deck's shared element is the double rule; this deck's is the merrowed edge. Fixing its colour
  across all 22 (rather than letting it vary per badge like the interior threads do) is what
  makes the anchor-image discipline actually enforceable — `check_badge_art.py`'s anchor-agreement
  check (§6.9 below) needs one stable, comparable border to measure drift against.
- **Why the outer shape is named per scene line instead of left to the model.** Leaving it
  unspecified is exactly how a "generic embroidered patch" request reverts to a circle — the single
  strongest prior in this training distribution for the phrase "embroidered patch." Naming the
  shape in every line is the same fix the reference deck used for its own default-object problem
  (naming the subject explicitly rather than trusting "one subject per badge" as a standalone
  rule).

---

## 5. Script adaptation notes

### 5.1 `tools/gen_badge_art.py`

Ported from the daily-words tool with two deliberate simplifications and one required
coordination point:

**Drop `--provider` and the `PROVIDERS` table.** The roadmap header pins the model outright:
"Badge art: `qwen/qwen-image-3-pro` via OpenRouter." The reference tool's two-provider table
exists because that deck was actually built across an OpenAI-to-OpenRouter migration and both
providers have shipped masters on disk; run-insights starts from zero with one provider chosen in
advance. Carrying the OpenAI branch — the multipart `/images/edits` upload, the `post_edit`
function, the `--model` default-per-provider logic — would be dead code from the first commit.
Keep a single `post_openrouter`-shaped function (rename to `post_generation`, since there is only
one path now), still built from the reference's hard-won parts: the `input_references` anchor
field, `resolution`/`aspect_ratio` (not `size` — OpenRouter ignores `size` and defaults to 2K,
which fails check 1 after the money is spent), `--seed` honoured, and the `.env.local`-before-
environment key read with its printed source line.

**Drop `--kind` and the `KINDS` table.** The reference tool serves two decks (`badge` and
`level`) because daily-words has both a badge shelf and a level-panel system. Run-insights has
only the badge shelf — there is no `lib/badges/levels.ts` equivalent in the roadmap and none is
planned. A single-deck tool is simply the reference tool with `KINDS["badge"]`'s five fields
(`contract`, `source`, `masters`, `subject`, `noun`) inlined as module constants:

```python
CONTRACT = SKILL / "style.md"
SOURCE = ROOT / "lib" / "badges" / "catalog.ts"
MASTERS = ROOT / "assets" / "badges"
SUBJECT = "SUBJECT FOR THIS BADGE"
```

If run-insights ever grows a second art deck, restore the `KINDS` abstraction at that time —
don't build it now for a deck that doesn't exist, the same argument as dropping `--provider`.

**Coordination point: the catalog regex.** The reference's `CATALOG_RE` /
`KEY_RE` pair assumes `export const BADGE_CATALOG = [ { key: "...", ... }, ... ] as const` in
`badges.ts`. This plan assumes F09's `lib/badges/catalog.ts` exports an equivalently-shaped
`BADGE_CATALOG` (or a table under that name) with a `key: "..."` field per entry, because that is
the natural TypeScript shape for §4.6's table and it is the shape the reference tool's regex
already knows how to read. **This is an assumption, not a confirmed fact about F09's code**,
because F09 has not been built yet at the time this plan is written. When F09 lands, check the
actual export name and field shape before running `gen_badge_art.py` for the first time; if either
differs, `CATALOG_RE` and `KEY_RE` are a two-line change, not a redesign — the regex only cares
about the array literal shape, not what F09 calls the constant.

Everything else carries over verbatim and should not be re-derived: the `.env.local`-before-
environment key read and its printed-source-not-value line, the `RES_OPTIONS=no-aaaa` WSL DNS
workaround, the hand-built JSON POST (still no `requests`/`httpx` dependency — this machine has
neither and an offline art tool is not the place to add one), the sidecar `.txt` format and its
`style version:` line (parsed by `make_badge_assets.py`), the `next_attempt_path` numbering, the
`--dry-run`/`--note`/`--seed` flags, and the parity assertion between `<!-- SCENES -->` and the
catalog that refuses to start rather than generating something the manifest can't place.

### 5.2 `tools/check_badge_art.py`

This is the harder rebuild, because the reference tool's nine measurements are tuned to flat
cream paper and two flat inks, and a textured navy twill with five saturated threads fails
several of them **by construction**, not by any flaw in the candidate. Going through them in
order:

**1 — geometry (1024×1024).** Survives unchanged. The master canvas size has nothing to do with
paper or thread.

**2 — alpha (must be opaque, or flat 255).** Survives unchanged. The patch is still full-bleed
on its substrate, never a cutout with a transparent background.

**3 — "bare-paper edge" → replaced with "twill margin."** The reference check wants the margin
**warm** (`r - b >= 6`) and **light** (78–96% sRGB luminance) with **low** variance (stdev ≤ 6,
spread ≤ 4). Every one of those four properties is wrong for navy twill: the substrate is **cool**
(b > r, so warmth should be checked as *negative or near zero*, not positive), **dark** (roughly
5–15% relative luminance for a hex like `#1B2A44`, nowhere near 78–96%), and — this is the
subtle one — **deliberately textured**, not flat, because §4.7 explicitly asks for "visible
weave." A stdev ceiling built for flat paper would reject the fabric grain the style block asks
for. The replacement check needs: a luminance band centred on the navy hex (derive the exact band
from the anchor plus a couple of early candidates, not from the hex in isolation, since raking
light will lighten the lit corner and darken the shadowed one); a warmth band that is *loose and
signed negative* (`r - b <= -4` or similar, catching an accidentally warm/sepia drift rather than
demanding one); and — new — a variance **floor**, not just a ceiling, of maybe stdev ≥ 3, to catch
the specific failure of a flat digital navy rectangle with no fabric grain rendered at all. Ship
all three bands as rough guesses from the anchor alone and mark them, in the same comment style
the reference file uses, as **not yet re-derived from an observed distribution** — because they
aren't; this deck has zero approved images at the moment this plan is written.

**4 — palette agreement → re-derived, and one guard removed outright.** The colorimetry itself
(convert to Lab, ΔE76 against a fixed token list, report the percentage of pixels within
tolerance) is sound and survives. What must change is the token list: replace the reference's ten
`tokens.css` swatches with seven — the navy substrate, the five main threads, and the one
signature thread, all from the style block's hex values. **Delete the "unauthorised blue/violet"
guard outright** (the reference's `cool_pct <= 1.5` check on hue 190°–330°). That guard exists to
catch a cool colour drift *against a warm cream paper* — here the substrate **is** navy, i.e. is
itself squarely inside that hue band, so the guard would fail every correctly-generated candidate
by definition. Porting it unexamined is exactly the mistake the reference's own key-hygiene
section warns about with a different check ("it walks the tree... it did NOT cover the second key
for free"): a check that generalizes in form does not generalize in meaning. Expect to loosen both
the ΔE tolerance (from 20 up to somewhere near 28–32) and the minimum matching-pixel percentage
(from 88% down to perhaps 65–75%) before the first real candidate, because satin-stitch sheen and
raking-light shadow put many genuinely-correct pixels *between* two named thread colours in a way
flat printed ink never does — but do not guess these numbers as final; re-derive them at six
approved badges exactly as the header rule requires.

**5 — contrast against both themes → replaced, not re-derived.** The reference check encodes a
specific compositional decision (F12/F13's D3): the badge *plate* should sit "nearly flush" with
the app's light-mode paper background, because it is drawn borderless and the app's own card
frame supplies the separation. That premise does not hold here. A dark, busy, saturated
embroidered patch is not a background-flush plate — it is a self-contained tile that will be
shown inside its own card regardless of theme, and asking it to "nearly vanish" against a light
background is not what §4.7 wants from an object explicitly designed to look nothing like the
surrounding calm UI. Replace the check with a much looser sanity floor: the patch's overall
luminance must differ from *both* candidate app backgrounds by some minimum WCAG contrast (so a
badge is never literally invisible in either theme), with **no ceiling at all** — being visibly
distinct from the page chrome is the expected, correct outcome here, not a failure mode. This
check cannot be finished properly until real theme background hex values exist (see §5.3), so it
ships against placeholder values first and is updated once F08's DesignSync pull lands.

**6 — vermilion share → renamed "signature thread share."** Same advisory logic, same tiny-mark
philosophy (0% means no second pass at all; a double-digit percentage means the whole subject got
painted in it). Only the hue window changes, from vermilion's near-0°/360° to the signature
orange's roughly 15°–35°. Keep it advisory for the same reason the reference does: a global hue
share measures warmth, not intent, and a badge could clear this band while still having its
signature mark in the wrong *place* — that's what the LOOK AT IT step is for.

**7 — legibility at 40 px → survives, band re-derived later.** The stdev-of-a-40px-grayscale-
thumbnail proxy has nothing style-specific in it; it measures "does this collapse into visual
mush," which is a question equally worth asking of a stitched patch. Keep the mechanism, keep the
same "do not tighten before six approvals" discipline for the actual number — and expect the
number itself to land *higher*, if anything, than the reference deck's 16.0 floor: a raised
satin-stitch patch under raking light has more inherent local contrast (stitch-row highlight and
shadow) than a flat line engraving does, so a genuinely bad candidate here may need a stricter
floor to be caught by this proxy at all. Guess, don't assume; re-derive at six.

**8 — composition safety → the one genuine algorithm rewrite, not just a new band.** The
reference's `seal_radius` and `seal_centre_offset` are built on a **radial ink-density scan**: they
assume the shared element is a circle and fit a first-harmonic offset to a ring of samples taken
at every angle. That assumption is not just imprecise here, it is **categorically wrong**, because
this deck's shared element is *not* rotationally symmetric — the outer shape is a shield, a
hexagon, a chevron or a rounded triangle, varying **by design** across the 22 badges (§4.7).
A radial fit run against a hexagon will not find its edge the way it finds a circle's, and running
it against a chevron is close to meaningless. This needs a different foreground-detection
strategy entirely: build the same "how much darker/more saturated than the substrate is this
pixel" density map the reference builds (`inkiness_map`'s idea survives, generalized to "distance
from the navy hex" rather than "distance from the paper luminance"), then instead of fitting a
ring, take the **bounding box of the contiguous foreground mass** above a density threshold and
report (a) its centroid offset from the image centre, replacing `seal_centre_offset`, and (b) its
width as a fraction of the image width, replacing `seal_radius` as the shape-agnostic stand-in for
"how big is the patch." The **outer-margin-quiet check inverts its direction**, same as check 3:
the reference wants the margin's grayscale stdev *low* (flat paper); this deck wants it
*non-trivially present but bounded* (visible weave, not visible clutter) — a floor and a loose
ceiling both, rather than a ceiling alone.

**9 — anchor agreement → mostly survives, one term redefined.** `9b`'s plate-luminance-vs-anchor
comparison is exactly the right instinct and needs no conceptual change, only recomputing against
the navy baseline instead of cream — it is still asking "are all 22 badges stitched on the
same shade of the same fabric," which is precisely what the anchor exists to guarantee. `9a`'s
seal-radius-vs-anchor **must be redefined** from "ring radius" to "foreground bounding-box width,"
per the check-8 rewrite — and it must be compared **within reason across different outer shapes**,
because unlike the reference deck (where every badge shares one circle radius by contract), this
deck's badges deliberately use four different silhouettes. A hexagon and a chevron built to "fill
about 80% of image width" per the style block should land at comparable bounding-box widths even
though their shapes differ, so the check is still meaningful — but expect a wider drift band than
the reference's ±4.0%, because shape variation alone introduces spread that pure ring-radius
noise never had to account for. `9c`'s mean-colour-distance advisory survives unchanged — it is
already loose by design, and "the subjects are supposed to differ" is exactly as true here as
there.

**A new, tenth measurement: weave-texture presence, advisory.** No analogue exists in the
reference tool, because the reference substrate is flat by contract and this one explicitly is
not. Given §4.7's "visible weave" requirement and the SKILL.md judgment order's warning that a
flat, printed-looking fill is this style's single most likely quiet drift, it is worth a dedicated
number rather than relying entirely on a human eyeballing the theme strip: sample local variance
in the substrate margin (the same region check 3 already isolates) at a finer grid than check 3's
overall stdev, looking specifically for the small-scale, regularly-spaced variation a woven twill
produces under raking light, as distinct from either "perfectly flat" (fails low) or "randomly
noisy" (a bad candidate with visual artifacts, which would also fail this check but for a
different reason worth telling apart in the printed report). Keep it advisory — like check 6, it
measures a real property but not intent, and LOOK AT IT is still the actual verdict.

**On `NOT_MEASURED`.** The reference tool's printed reminder that lettering is not measured by
anything in the script carries over verbatim, with one addition: the merrowed-border texture (a
regular, dense, tight zigzag) is offered as this deck's blind-by-construction proxy in the same
way the reference's lozenge-and-dot band was — a script that "counted small dark blobs around the
edge looking for letters" would trigger on the merrowed border's own correct stitching just as
readily as it would on real lettering, so it isn't worth building. Read `<name>.ring.png`.

### 5.3 The one dependency this plan cannot close by itself

`check_badge_art.py`'s theme-strip crop (the artifact that forces judging the badge "at the sizes
the app actually draws," against real backgrounds) needs two real hex values — the app's light-
and dark-mode backgrounds — and **neither exists yet**. `docs/design-brief.md` at the time this
plan is written is a prompt waiting to be pasted into Claude Design; there is no `app/globals.css`
`@theme` block, no `docs/design/DESIGN_INTEGRATION.md`, nothing to read a hex value out of.

Build order puts F10 dead last, after F08 — and §5 of the roadmap says the design pull happens
"once F08 has real screens to dress" — so by the time F10 actually runs, real tokens should exist.
Two instructions follow from that: (1) write the theme-strip code now against clearly-labelled
placeholder values (a neutral off-white and a near-black — exact placeholder hexes don't matter,
since they exist only to keep the script runnable during F10's own build-out) so nothing here is
blocked on F08 finishing first; (2) the *last* task before generating any real badge (task 10 in
§8 below) is confirming the placeholders have been swapped for F08's actual tokens, because
judging 22 badges against the wrong background is 22 wasted LOOK AT IT passes.

### 5.4 `tools/make_badge_assets.py`

No equivalent script was read from daily-words (it wasn't in the required reading list and this
plan does not invent its internals from nothing), but its two jobs are named by the reference
skill's own "what this skill does not do" section and by F10's ownership list, and they carry
over directly:

1. Promote every approved `assets/badges/<key>.png` into `public/badges/**` under a content-hashed
   filename (so a re-promoted badge is a new, cache-busted URL rather than a silent overwrite).
2. Generate `lib/badges/badge-art.ts` — a `Record<BadgeKey, BadgeArt>`, total over every key in
   `BADGE_CATALOG`, so a badge with no promoted art is a `npm run typecheck` failure rather than a
   silent gap in the shelf, mirroring the reference deck's own "the build is red on purpose between
   adding a key and promoting the art" property.

It should read the `style version:` line out of each `.png`'s sidecar `.txt` (never from the
current `style.md`, for the identical reason given in SKILL.md's "what this skill does not do")
and warn, rather than fail, on a master with no sidecar — recorded `"unknown"`.

---

## 6. `OPENROUTER_API_KEY` hygiene

Unchanged in spirit from the reference deck's rule, restated in run-insights' own terms:

- **Read by exactly one file:** `tools/gen_badge_art.py`, at build/tooling time only, never at
  request time, never inside `app/` or `lib/` or `components/`.
- **`lib/env.ts` has no entry for it.** The eager-parse-at-import guard F01 builds (per roadmap
  §4.1, "following `expense-tracking/lib/env.ts`") covers the *application's* environment
  contract — `LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */`, `LLM_API_KEY`, `DATABASE_URL`, and so on. `OPENROUTER_API_KEY`
  is deliberately outside that contract, the same way it sits outside daily-words' `src/lib/env.ts`.
- **The assertion:**

  ```bash
  grep -rE 'OPENROUTER_API_KEY' app/ lib/ components/
  ```

  must return nothing, and this is checked mechanically, not just documented. Add a small script
  — `scripts/check-badge-art.ts` (or a Vitest test under `lib/`, whichever this project's F01
  test-running convention prefers) — that runs the grep and fails if it finds anything, and wire
  it into CI (roadmap §4.1: "asserted in CI") and into a `package.json` script, e.g. `npm run
  badges:check`, alongside whatever F01 already runs. **One assertion, one variable** — there is
  no second provider key to also assert here, unlike the reference tool's `KEY_VARS` list, because
  §5.1 already established this deck has exactly one provider.
- **The key currently lives in `/home/miftah/daily-words/.env.local`. Run-insights needs its own
  copy, not a symlink and not a shared file.** `/home/miftah/run-insights/.env.local` already
  declares an empty `OPENROUTER_API_KEY=` line (it is part of the §4.1 template quoted into the
  roadmap and was scaffolded ahead of this plan); a human needs to paste the actual value in
  directly. **Do not do this via a script or an agent that would print, log, or pipe the value
  anywhere** — copy it by hand, the same "never print the value" rule `gen_badge_art.py` itself
  follows. Both `.env.local` files are already gitignored; confirm that stays true rather than
  assuming it.
- **Never printed, never echoed into a report, never pasted into a file.** `gen_badge_art.py`
  prints only which source the key came from (`.env.local` or the environment), exactly like the
  reference tool.

---

## 7. Cost and pacing

`qwen/qwen-image-3-pro` is **~$0.04 and 4–5 minutes per image**, per the roadmap header and per
the reference tool's own measured note. 22 badges at up to three attempts each is a real
budget: **worst case, 60 generations, ~$2.40 and up to five hours of wall-clock time**, before
counting the anchor run itself or any scene-line rewrites that avoid spending a third attempt.
Typical cost will be much lower — the reference deck's own history shows most badges land in one
or two attempts, and a scene-line fix (§SKILL.md step 6) is free — but "worst case" is the number
to plan sessions around, not the median.

**One badge per invocation, never a batch loop, is a cost control as much as a judgment control.**
A script that looped over all 22 keys would spend the full worst-case budget before a single
human had looked at a single theme strip, and — worse — it would do it *22 times over* on the
same structural mistake if the style block itself needed a scene-line fix after badge one.

What this means for sequencing, concretely:

1. **The anchor run is a hard serialization point.** Nothing else can generate meaningfully until
   one badge is approved and promoted to `_anchor.png`, because every subsequent generation
   depends on it (§SKILL.md step 2). Budget a full session for the anchor alone — it may take all
   three attempts, and a failed anchor is the one failure that invalidates every later badge, not
   just itself.
2. **Batch by shape family, not by catalog order.** Once the anchor is approved, generate the
   remaining badges in small groups by outer silhouette (the six shields, then the six rounded
   triangles, then the fours) rather than in `BADGE_CATALOG`'s order. A style problem specific to
   one shape family (e.g., a hexagon consistently reverting to a circle) is caught within its own
   group of four-to-six rather than discovered on badge eighteen after fourteen other shapes
   already succeeded.
3. **Budget three-to-five badges per working session.** At worst case (three attempts, ~15
   minutes of generation time alone per badge, plus the LOOK AT IT review time that is not
   optional), five badges is a multi-hour session even before any style-block revision work. This
   is not a task to attempt as a single continuous run across all 22.
4. **A style-block revision (bumping to v2) invalidates the anchor and every promoted badge's
   claim to be "current."** If a structural problem surfaces after several badges are already
   approved under v1, that is a stop-and-decide moment for a human, exactly as the reference
   skill's step 6 describes — not a reason to burn a fourth attempt trying to prompt around a
   problem the style contract itself created.

---

## 8. What the skill deliberately does not do

Restated from the SKILL.md draft above, because it is worth having once more outside the fence in
plain prose: the skill never writes to `assets/badges/` (promotion is `cp`, done by a human, both
the `.png` and its `.txt` sidecar, always); it never sets `_anchor.png` (the single highest-
leverage decision in the whole feature, made once, by a human); and it never runs
`tools/make_badge_assets.py` (that changes what ships — `public/badges/**` and
`lib/badges/badge-art.ts` — and belongs in its own commit next to a `npm run badges:check` run,
sequenced by the operator, not folded into an art-generation loop).

---

## 9. Numbered task breakdown

1. **Confirm `lib/badges/catalog.ts` is stable.** F10 depends on F09's catalog only (roadmap §5)
   — do not start §9 task 3 until F09 has shipped and its export shape is known, since
   `gen_badge_art.py`'s parity check needs the real `BADGE_CATALOG` shape (§5.1's coordination
   point).
2. **Add the run-insights copy of `OPENROUTER_API_KEY` to `.env.local` by hand** (§6). Confirm
   both `run-insights/.env.local` and `daily-words/.env.local` are gitignored.
3. **Create `.claude/skills/generate-badge/SKILL.md` and `style.md`** from the drafts in §2 and
   §3 above, adjusting only the `CATALOG_RE`/export-name coordination point if F09 landed with a
   different shape than assumed.
4. **Write `tools/gen_badge_art.py`** per §5.1: single-provider, single-kind, otherwise a direct
   port of the reference tool's key-read order, DNS workaround, prompt assembly, sidecar format
   and parity assertion.
5. **Write `tools/check_badge_art.py`** per §5.2: checks 1, 2, 7 and 9c ported with the
   substrate-appropriate re-derivation noted; checks 3, 4, 5, 6, 9a/9b rebuilt with new tokens and
   bands as detailed above; check 8's geometry rewritten from a radial ring fit to a
   shape-agnostic bounding-box/centroid measure; a new tenth weave-texture-presence check added.
   Ship all numeric bands as explicit, comment-flagged guesses pending six approved badges.
6. **Wire the placeholder theme-strip backgrounds** (§5.3) so the script runs standalone before
   F08's real tokens exist; leave a clearly-labelled TODO to swap them.
7. **Write `tools/make_badge_assets.py`** per §5.4: promote to `public/badges/**` with content
   hashing, generate the total `Record<BadgeKey, BadgeArt>` at `lib/badges/badge-art.ts`, sidecar-
   sourced style-version stamping, warn-not-fail on a missing sidecar.
8. **Add `scripts/check-badge-art.ts` (or equivalent) and its `npm run badges:check` entry**,
   asserting the single-variable grep from §6 stays empty; wire it into CI.
9. **Generate and approve the anchor badge** (recommend `early_bird`), promote both files, copy
   to `_anchor.png`. Human decision point; budget a full session (§7 task 1).
10. **Confirm F08's real light/dark background tokens exist and swap them into
    `check_badge_art.py`'s theme-strip crop** before generating badge two — this is the point
    §5.3 flags as the dependency this plan cannot close on its own.
11. **Generate the remaining nineteen badges in shape-family batches** (§7 task 2), one invocation
    per badge, full LOOK AT IT review per invocation, promoting each as approved.
12. **Once six badges are approved, re-derive every numeric band in `check_badge_art.py` from the
    observed distribution**, recording the observed range in a comment next to each band exactly
    as the reference tool's own header requires. Do this once, not per badge.
13. **Run `tools/make_badge_assets.py`** once all 22 are promoted, in its own commit, alongside
    a green `npm run badges:check` and `npm run typecheck`.
14. **Full-shelf visual QA:** generate (or reuse check_badge_art.py's per-badge theme strips to
    assemble) one contact sheet of all 22 badges at 40 px, side by side, and look at it once as
    a set — a step the reference deck's own SKILL.md doesn't need as heavily because that deck grew
    across many separate sessions over months, while this deck is built in one concentrated project
    phase where cross-badge drift is more likely to go unnoticed badge-by-badge and easier to catch
    with everything on the shelf at once.

---

## 10. Verification

Before F10 is considered done:

- `python3 tools/gen_badge_art.py --dry-run --all` runs clean — the `<!-- SCENES -->` key set
  matches `BADGE_CATALOG` in `lib/badges/catalog.ts` exactly, 22 keys each way.
- All 22 `assets/badges/<key>.png` + `.txt` sidecar pairs exist, each one promoted from a
  candidate that passed every hard check in `check_badge_art.py` and a documented LOOK AT IT
  review (theme strip, ring crop, centre crop, judged in the order SKILL.md specifies).
- `assets/badges/_anchor.png` exists and is a copy of one of the 22 approved masters.
- `tools/make_badge_assets.py` has been run once; `public/badges/**` is populated with content-
  hashed filenames; `lib/badges/badge-art.ts` is a total `Record<BadgeKey, BadgeArt>` — confirmed
  by `npm run typecheck` passing.
- `grep -rE 'OPENROUTER_API_KEY' app/ lib/ components/` returns nothing, and `npm run
  badges:check` (or its CI equivalent) asserts this mechanically rather than by inspection.
- `check_badge_art.py`'s numeric bands have been re-derived once from the observed distribution
  of the 22 approved badges (§9 task 12), with the observed ranges recorded in comments —
  not left at their pre-generation guesses.
- The full-shelf contact sheet (§9 task 14) has been reviewed once, specifically checking the
  collision-audit pairs named in `style.md` (`century_club`/`double_century`,
  `groundhog_day`/`consistency_gremlin`, the three-post tally, the three-light-source tally) for
  convergence that individual per-badge review could plausibly have missed.
- No shoe, medal, stopwatch, trophy, ribbon, rosette, laurel, cup, crown or tick appears anywhere
  in the 22 approved masters.
- No lettering of any kind appears anywhere in the 22 approved masters, confirmed by a human
  reading each `.ring.png` at generation time — this is the one property nothing in
  `check_badge_art.py` measures, by design (§5.2, `NOT_MEASURED`), and it is also the property
  most likely to be wrong if skipped.
- CI is green: `npm run typecheck`, `npm run badges:check`, and whatever test suite F01 wires up
  by the time F10 runs.

---

## 11. As built — five divergences from this plan, and why

Recorded here rather than by editing the sections above, so the plan stays readable as what was
decided in advance and this section stays readable as what actually happened. **None of these
touches roadmap §4.6 or §4.7**, so there is still no `## Contract deltas` section.

**1. Twenty-two scenes, not twenty.** §3's `<!-- SCENES -->` block shipped with twenty lines and
§1's table says "deck size 20", both written before R-33 grew §4.6 from 20 keys to 22. F09 shipped
the 22-key catalog, so `style.md` carries 22 scene lines and `gen_badge_art.py`'s parity assertion
would have refused to start otherwise — which is the guard doing exactly its job, before any money
was spent. The two new scenes were written against the collision audit rather than appended to it:

- `two_a_days` — a cast-iron pan seen from above holding two fried eggs, signature thread on the
  second yolk. A hexagon. The audit gained a **disc tally** for it: `early_bird`'s sun is a
  backdrop behind a rooster, `half_ish`'s moon is split by a hard line, and this pan's handle is
  the silhouette. If a candidate loses the handle it resolves to a plain circle, which is the
  failure to catch.
- `boring_excellence` — a spirit level lying dead flat, bubble centred between two scribe marks,
  signature thread on the bubble. A chevron. Recorded in the audit as **the pair to watch against
  `metronome`**: both are precision instruments that say "steady" without a dial, kept apart on
  silhouette (a tall pyramid against a long horizontal bar) and by the absence of numerals on
  either, which is what keeps both out of the clock/gauge family the scene rules forbid.

Shape distribution is now shield × 6, hexagon × 5, chevron × 5, rounded triangle × 6.

**2. §5.3's dependency is closed, and no placeholder shipped.** That section instructed the theme
strip to be written against clearly-labelled placeholder backgrounds because
`docs/design-brief.md` was still a prompt waiting to be pasted into Claude Design. F08 has since
shipped and `app/globals.css` carries the real tokens, so `check_badge_art.py` composites against
`--paper` `#C9E9FB` (light) and `#0E1B26` (dark) directly. **§9 task 10 is therefore already
done** and is not a gate on badge two. These are the only app design tokens anywhere in F10, and
they appear in the *strip* rather than in the *prompt* — the patch palette is deliberately not the
app's (R-36 / R-43).

**3. §5.1's coordination point resolved as the two-line change it promised, not a redesign.** F09
shipped `BADGE_CATALOG` as a `readonly BadgeDefinition[]` built by a `badge(key, title, scope)`
helper rather than as the `{ key: "...", … }` object literals the reference tool's `KEY_RE`
expected. The array literal is still the thing being parsed; only one entry's shape differs, so
`KEY_RE` matches `badge('key', …)`. Three files carry that pair of expressions — both Python tools
and `scripts/check-badge-art.mjs` — and all three fail loudly rather than returning zero keys.

**4. `tools/make_badge_control.py` is new, and it is why any of this is verified.** F10 ships a
measurement tool for a deck that does not exist yet: zero approved masters, so every band in
`check_badge_art.py` is a documented guess with nothing on disk to run it against. The control
tool draws four synthetic patches from `style.md`'s own hex values — a plausible one, a flat
weaveless one, an off-centre one, and a bleached one — which makes the checker's behaviour
demonstrable for free. All four behave as designed: the good control clears every hard check, the
flat one fails check 3's variance **floor** (and warns on 8b and 10), the off-centre one fails 8a
at 9.5%, and the bleached one fails check 3's grey band and, against the good one as anchor, 9b at
67 points. **A control is not a fixture and is never a source for re-deriving a band** — it is
drawn by arithmetic and a real candidate is photographed thread. §9 task 12 still reads six
approved masters.

**5. `badges:check` is `.mjs`, and it passes on an empty deck.** §6 left the choice between a
script and a Vitest test to F01's convention; the convention turned out to be
`scripts/check-*.mjs` plus a named CI step, so that is what shipped, and
`scripts/check-openrouter-boundary.mjs` was refactored to export its grep so there is one
implementation behind both `npm run ci:openrouter-guard` and `badges:check` §1. The script has to
be meaningful in three states — no masters, some, all 22 — so it reports which state it is in
rather than failing on an incomplete deck. It also asserts three things §6 did not ask for and the
deck needs: that every promoted master carries its sidecar, that one style version covers the
whole deck and matches `style.md`, and that `_anchor.png` is byte-identical to one of the approved
masters rather than to a stray candidate.

### What is deliberately still open

**Tasks 9–14 are not done and cannot be done by tooling.** The 22 images are a human loop:
`OPENROUTER_API_KEY` is empty in `.env.local` (§9 task 2 is a by-hand paste, on purpose), the
anchor run is a hard serialization point that invalidates every later badge if it is wrong, and
every badge needs three crops read by an eye before promotion. Worst case is ~60 generations,
~$2.40 and up to five hours (§7). The machinery is complete and green; the deck is 0/22.

**`components/profile/BadgeShelf.tsx` is untouched, and that is correct.** F09's `BadgePatch`
renders the navy placeholder R-36 records as the *intended* treatment, with a comment reserving
F10's slot. Wiring `BADGE_ART` into it today would not compile: the manifest is a total
`Record<BadgeKey, BadgeArt>` that `make_badge_assets.py` refuses to emit until all 22 masters
exist. The wiring belongs in the same commit as the finished deck — which is exactly the "the
build is red on purpose between adding a key and promoting the art" property the total Record was
chosen for.
