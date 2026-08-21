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
<!-- STYLE BLOCK v2 -->
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
gauge and the same width. Inside that border the whole interior is filled edge to edge with a
solid field of slate-sky-blue satin stitch — the same field colour on all 22 badges, so the patch
reads as one bright solid shape and not as an outline drawn on cloth. This badge's own subject is
stitched on top of that field, alone, filling most of it with generous room at the corners. The
field is never left as bare navy twill: a patch is a solid stitched object sewn onto the cloth,
and the cloth must never show through inside the border.

THREAD: five saturated colours, laid as dense machine embroidery, and nothing else.
  - Cardinal red, near #C23B2E
  - Kelly green, near #2E7D46
  - Marigold gold, near #E3A72E
  - Bone / cream, near #EDE3C8 — carries the merrowed border and any bright highlight row
  - Slate sky blue, near #4C8FB0 — carries the interior field of every badge, the one ground
    colour the whole set shares, and appears in a subject only where that subject specifically
    needs a cool note of its own
Bone and slate are the set's furniture: bone is always the border and slate is always the field,
on all 22 badges. Each badge then draws its SUBJECT from two or three of the remaining colours —
never all of them in one badge, and never fewer than two, or the patch reads as flat rather than
embroidered.

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
no medals, no stopwatches, no running shoes, and no ticks. Those objects are the default a
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
- early_bird: A single rooster in profile on a fence rail, neck stretched fully forward and beak lifted into a plain rising sun disc that sits directly behind its head, the comb a small stitched crest along the skull. SHAPE: shield. SIGNATURE THREAD: the rooster's open beak.
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
- two_a_days: A single heavy cast-iron frying pan seen from directly above, its handle running off to one side, holding two whole fried eggs side by side in the pan with their yolks intact. SHAPE: hexagon. SIGNATURE THREAD: the yolk of the second egg, the one further from the handle.
- boring_excellence: A single long spirit level lying flat and dead horizontal, its body a plain bar, its one glass vial set at the centre with the bubble sitting exactly between two plain scribe marks. SHAPE: chevron. SIGNATURE THREAD: the bubble itself, centred in its vial.
<!-- /SCENES -->
```

Shape distribution, recorded rather than left implicit: **shield** × 6 (`early_bird`,
`self_reward`, `sandbagger`, `century_club`, `new_ceiling`, `dawn_patrol`), **hexagon** × 5
(`late_start`, `fast_start_fool`, `groundhog_day`, `half_ish`, `two_a_days`), **chevron** × 5
(`negative_split`, `cadence_collapse`, `tourist`, `sweat_equity`, `boring_excellence`),
**rounded triangle** × 6 (`metronome`, `redline_republic`, `warmup_who`, `double_century`,
`consistency_gremlin`, `long_way_home`). Uneven on purpose — real patch collections repeat
shapes — but no two badges flagged as adjacent in the audit below share a shape.

### The collision audit

Done at design time so the judge has a baseline to check against, rather than noticing
convergence on badge sixteen:

rooster-and-sunrise / wilted sunflower / bitten doughnut / diagonal comet / metronome / spent
match / torn flag / hanging sloth / collapsing step-ladder / hydrant jet / groundhog-in-burrow /
blank signpost / yarn-wound post / bunting between two posts / half-lit moon / sweating piggy bank
/ burst ceiling board / gremlin-on-blocks / lighthouse beam / folded map-and-pin / pan of two eggs
/ level and bubble.

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

### What the anchor run changed, and why v2 exists

**The interior field is the set's second piece of furniture, and v1 did not say so.** v1's PATCH
paragraph named the subject and the border and left the ground unspecified, while its THREAD
paragraph forbade slate sky blue "as a background wash". Attempt 1 filled the shield with pale
slate anyway and read *well* at 40 px; attempt 2, corrected to leave the ground as bare navy
twill, obeyed the contract and read *worse* — the patch became a thin bone outline whose interior
merged with the navy margin, and against the app's dark `--paper` (`#0E1B26`) the whole object
nearly vanished into the page. Two attempts, two opposite failures, one cause: **v1 had no answer
for what is inside the border**, so the model supplied one and the contract could only say no.

v2 answers it. Slate sky blue is promoted from "used sparingly" to the shared interior field, and
bone stays the shared border, so a badge is a bright solid shape on dark cloth at any size —
which is what "READ AT FORTY PIXELS" was always asking for and what a real club patch actually is.
The cost is one colour's worth of freedom per badge; the gain is that all 22 read as one set at
shelf size, which is the only size that matters.

**This bump cost nothing, and that is exactly why it happened now.** A style-block revision
invalidates every promoted badge's claim to be current (plan §7 task 4), so it is a
stop-and-decide once art exists. At the anchor run, zero badges are promoted — surfacing a
structural contract problem here is the anchor's whole job, and the moment it is cheapest to act
on. A v2 discovered at badge sixteen would have cost fifteen regenerations.

**early_bird's signature thread was a ring, and the anchor run proved that cannot work.** The line
first read *"the sun disc's rim, one continuous bright ring behind the rooster's head"* — which is
an **outline**, the one thing the style block says the signature must never become. Attempt 1
executed it faithfully and measured 5.29% signature share against a 3.00% ceiling, with the orange
reading as a second border rather than as a second pass. The fault was the scene line's, not the
model's, so it was rewritten to **the rooster's open beak** before the second attempt rather than
after three. Recorded because the mistake is easy to repeat: any scene whose obvious "bright
accent" is the *edge* of a round thing — a rim, a halo, a hoop, a collar — is asking for an
outline, and the fix is always to move the mark to a small solid feature instead.

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

**two_a_days and early_bird both put a disc near the centre, and this is the third disc-adjacent
tally.** `early_bird`'s sun sits *behind* a rooster and is read as a backdrop; `two_a_days`'s pan
is a disc that IS the object, with a handle running off one side — a lollipop silhouette, not a
circle. `half_ish`'s moon is the deck's only bare disc and it is split down the middle by a hard
line, which is what keeps it from reading as either. If a candidate for `two_a_days` loses its
handle or its two yolks and resolves to a plain circle, that is the failure to catch: the handle
is the silhouette, and the two yolks are the joke.

**two_a_days and boring_excellence are the two scenes written after the original twenty, and both
were checked against the deck rather than added to the end of it.** R-33 grew §4.6 from 20 keys to
22 and these are the two that arrived with it. `boring_excellence` is the pair to watch against
`metronome`: both are precision instruments and both say "steady" without a dial. They are kept
apart on silhouette — a metronome is a tall pyramid with a vertical arm, a spirit level is a long
flat horizontal bar — which are close to opposite shapes at 40 px, and the deliberate absence of
any numerals on either is what keeps both out of the clock/gauge family the scene rules forbid.

---

## Where this style came from

Roadmap §4.7 drew the boundary: **a vastly different medium from `daily-words`, not vastly
different scenes.** The seven axes in that section — medium, substrate, palette, technique,
silhouette, light, tone — are the seven paragraphs of the style block above, in the same order,
so the block can be checked against the roadmap line by line.

The five main threads and the one signature thread are **not** drawn from `app/globals.css`'s
`@theme` tokens, and that is the deliberate opposite of the reference deck's practice of drawing
its ink from `tokens.css`. §4.7 (as restated in R-36 and R-43) specifies the shelf to look nothing
like the calm reading-app chrome around it — "loud, sporty, a little absurd" is explicitly not the
app's own voice, and "the shelf stays quiet so the patches can be loud" is the sentence both the
roadmap and the v2 design's `BadgeTile` repeat. Tying the badge palette to the app's sky-blue
paper and coral accent would undercut the one design decision the roadmap was most explicit about.
The app's real tokens appear in exactly one place in this feature — `check_badge_art.py`'s theme
strip, which composites the patch against `--paper` in both schemes so a human can see it in
situ — and nowhere in the prompt.

Full argument for the script rebuild is §5 and §6 of `docs/plans/F10-badge-art-skill.md`.
