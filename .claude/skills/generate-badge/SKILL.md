---
name: generate-badge
description: Generate and grade one embroidered badge-patch image for Run Insights' badge shelf via OpenRouter. Use when asked to generate, regenerate or iterate on badge art — e.g. "/generate-badge early_bird", "regenerate the sandbagger patch", "the gremlin badge is unreadable at 40px", "make a patch for the new badge key" — or whenever a key is added to BADGE_CATALOG and needs art. Handles the whole loop: prompt assembly from the locked style contract, generation against the deck anchor, measurement, and visual judgement at the sizes the app actually draws.
---

# Generate badge art

One badge per invocation. **Never a batch loop in one call** — the three-attempt cap and the
look-at-it step are per badge, and a loop makes both ceremonial. At ~$0.04 and 4–5 minutes per
generation, a batch loop is also real money and real wall-clock time spent before a human has
looked at any of it.

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

### 2. Find the anchor — and do NOT pass it as `--reference`

```bash
ls assets/badges/_anchor.png
```

**The anchor is check 9's baseline, not a generation input. This reverses the design plan, and
the reversal is measured rather than preferred.** The plan reasoned that 22 badges must share one
twill tone, one border weight, one stitch gauge and one light direction, and that each is a
continuous quantity a text prompt specifies loosely and an image specifies exactly. Sound a
priori; false for this model. On `self_reward`, three generations from the identical prompt:

| attempt | `--reference` | 9b twill drift | subject |
|---|---|---|---|
| a01 | anchor | **9.5 pts — FAIL** | redrew the anchor's rooster |
| a02 | anchor | **9.3 pts — FAIL** | a ring made of rooster parts |
| a03 | none | **1.9 pts — PASS** | the doughnut the scene asked for |

`input_references` on `qwen/qwen-image-3-pro` behaves like a strong img2img, not a style
reference: it transfers the **subject** hard and the **cloth tone** not at all. Passing the anchor
made set coherence *worse* on the one number that measures it, while destroying the very thing
each badge is generated for. A second badge is not a second opinion — watch 9a/9b on every badge
and say so in your report if unreferenced generations start drifting past 8 points.

**What actually holds the deck together is the style block plus one fixed seed.** Use
`--seed 1970` on every badge, the way `early_bird` and `self_reward` were generated; they landed
1.9 points apart on twill tone with no reference between them.

- **Present** → generate *without* `--reference`, and let `check_badge_art.py` compare against it.
  Check 9 is where the anchor earns its keep, and it is how this finding was caught at all.
- **Absent** → you are generating the anchor. §8 of this skill's design plan recommends
  `early_bird` for the anchor run — it is a shield, it exercises two of the five main threads
  plus the signature thread, and its subject (a rooster against a sun disc) is simple enough to
  judge cleanly before the harder subjects are attempted. If the user asked for a different key
  with no anchor on disk, say that the set has no anchor yet and ask whether to make *this* badge
  the anchor or to do `early_bird` first. **Say in your report that this was an anchor run**,
  because the operator has a promotion to perform that they do not have on any other run.

### 3. Generate

```bash
python3 tools/gen_badge_art.py <key> --seed 1970
```

The tool warns when an anchor exists and `--reference` was not passed. **That warning is now
expected and correct** — see step 2. It is left in place rather than removed because the finding
behind the reversal is one badge deep, and a warning that has to be read every time is the right
weight for a decision that may yet be revisited.

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

Ten measurements, not the reference tool's nine — §5.2 of the design plan adds one with no
analogue there, because "flat printed graphic" instead of "actually stitched" is this style's
single most likely quiet drift, and it deserves its own number. Hard checks set the exit code;
advisory ones only print. It also writes the three files step 5 needs.

**Do not tighten a band because one candidate missed it.** The bands ship as gross-failure
catches, most of them derived by *guess* rather than by observation because this deck starts
from zero images — there is no thirteen-badge distribution to draw a band from yet, unlike the
tool this descends from. **Do not treat that as license to tighten anything before six badges are
approved and the bands can be re-derived from a real distribution**, exactly as the reference
tool's own header insists. A threshold that fails on something harmless is a threshold somebody
comments out.

### 5. LOOK AT IT

`check_badge_art.py` writes three files beside the candidate. **Read all three with the Read tool
before forming any opinion.**

- `<name>.themes.png` — a contact strip: the badge at **40 px and 220 px**, against the app's
  real `--paper` in both colour schemes. **Judge from this strip. Do not judge a badge from the
  1024 master** — at 1024 every stitch looks considered, and the app never draws it at 1024.
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
  navy rectangle is not this substrate even if the hex number matches. Check 10 puts a number on
  this; the number is advisory and your eye is the verdict.
- **Does it repeat another badge's subject?** The twill, the merrowed border and the five-plus-one
  thread palette are shared by design; the interior is not. **Keep a running tally across the
  set** by category, not just by object: how many badges now centre on a creature perched on
  something, a vertical post standing alone, a single light source, a liquid drip, a disc? The
  collision audit at the foot of `style.md` names the adjacencies already checked at design time
  — read it before generating anything past the badge you are on, because a convergence noticed
  on badge sixteen is a convergence that cost fifteen badges of hindsight.
- **Does the signature thread read as a second pass?** One small satin-stitch mark, in the one
  colour (`#F2600C`, described in the style block) that appears nowhere else on the badge. If it
  has become the colour of the whole subject, an outline, a second subject, or more than one mark,
  it has stopped being a signature.
- **Is the outer shape the one this badge was asked for?** Image models default an "embroidered
  patch" request to a circle in a square, which is exactly the reference deck's silhouette and
  exactly the shape this style forbids. Confirm the shape named in the scene line — not a circle,
  never a circle — before judging anything else about the interior.
- **Is the occasion legible without words?** The shelf shows the mark and the title; the row
  shows the condition and the gloss. But a badge that needs the sentence to be understood at all
  has failed the picture's own job. Could someone who has never seen this app guess that
  `sandbagger` is about taking it easy?
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

- **It never sets the anchor.** Approving one badge as the reference for the other twenty-one is
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
code may read it** — it is not `LLM_API_KEY`, `lib/env.ts` has no entry for it, and

    grep -rE 'OPENROUTER_API_KEY' app/ lib/ components/

must stay empty. `npm run badges:check` and `npm run ci:openrouter-guard` both assert that
emptiness in CI.

Never print the value, never echo it into a report, never paste it into a file. The tool prints
*which source* it came from and not what it is.
