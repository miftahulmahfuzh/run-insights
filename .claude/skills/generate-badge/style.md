# The patch decks' style contract

Read by `tools/gen_badge_art.py`, which parses this file — the fences, the
`<!-- STYLE BLOCK vN -->` markers and the `- <key>: <scene>` line format are an **interface, not
decoration**. One file a human edits and a script reads, so the prompt that was sent can never
drift from the prompt that is documented.

**Bump the version when you change the style block.** Every patch carries its version in its
`.txt` sidecar and in the generated manifest, so a mixed set is detectable rather than merely
suspected.

**Two decks read this file, and they share the style block exactly.** F09's 22 badges and F25's 10
personal-record patches are one bolt of cloth cut thirty-three times — same substrate, same merrowed
border, same five threads, same signature thread — so there is exactly one style block, both decks
are sent it verbatim, and both stamp `v2`. **The scene list is the only per-deck text in this
file**, and that is a measured constraint rather than a tidy preference: see *"appending ANYTHING
to the style block destroys subject adherence"* below, which cost twelve generations to establish.
`tools/decks.py` is the table that maps a deck to its scene region, its catalog, its masters and
its manifest.

## What the parser takes from this file

| Region | Delimiters | Used for |
|---|---|---|
| The style block | `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->` | Sent verbatim with every badge. `N` becomes `styleVersion`. |
| The badge scenes | `<!-- SCENES -->` … `<!-- /SCENES -->`, lines matching `- <key>: <scene>` | One line appended per badge as `SUBJECT FOR THIS BADGE:` |
| The record scenes | `<!-- SCENES:records -->` … `<!-- /SCENES:records -->` | The same, for `--deck records` |

**A marker only counts when it is alone on its own line.**

`gen_badge_art.py` refuses to start unless the set of keys inside a deck's scene region is exactly
the set of keys in that deck's catalog — `<!-- SCENES -->` against `BADGE_CATALOG` in
`lib/badges/catalog.ts`, `<!-- SCENES:records -->` against `RECORD_CATALOG` in
`lib/records/catalog.ts`. A scene line with no key, or a key with no scene line, is a startup
error rather than a surprise 22 images later.

**The check is per deck, and that is not a detail.** F25 was first drafted with the ten record
scenes simply appended to `<!-- SCENES -->`; that would have made every *badge* generation refuse
to start, reporting ten orphan keys, because that region is checked against `BADGE_CATALOG`. Two
regions, two catalogs, no interference.

### The block cannot be bumped, and cannot be added to either

`scripts/check-badge-art.mjs` asserts that every promoted master's sidecar version equals the
version of the block in this file, so editing `STYLE BLOCK v2` to v3 fails `npm run badges:check`
on **all 22 existing badges** until every one of them has been regenerated and re-judged. That is
the price of a real style change, and it is the correct price.

F25 tried to buy a cheaper one — a small per-deck region appended after the block, so the records
deck could name a fifth silhouette without a bump. **It does not work.** With anything appended,
this model ignored the scene and returned generic novelty-patch subjects twelve times running;
with it removed the scene came through immediately. The measurements are at the foot of this file.

So there are exactly two options for anything a patch needs said, and no third:

- **per patch** → the scene line, or a `--note` on the one generation (the chevron precedent);
- **for the whole set** → a v3 bump, and regenerate every patch in both decks.

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
- double_century: A long string of bunting hung from a single hook at the top of the patch and folded once, so two identical lengths of triangular flags hang straight down side by side, each ending in its own point near the foot. SHAPE: rounded triangle. SIGNATURE THREAD: the flag at the very bottom of the longer of the two lengths.
- half_ish: A single full moon shown exactly half lit and half in shadow, one hard straight line dividing the bright half from the dark half down the centre. SHAPE: hexagon. SIGNATURE THREAD: the dividing line itself, running from the moon's top edge to its bottom.
- sweat_equity: A single round piggy bank standing alone, one heavy bead of sweat forming at its snout, its back entirely bare of any slot or mark. SHAPE: chevron. SIGNATURE THREAD: the bead of sweat at the snout.
- new_ceiling: A row of parallel wooden ceiling boards running straight across the patch, with the middle board burst upward out of line with its neighbours and its ends splintered where it tore free, a dark gap showing beneath it. SHAPE: shield. SIGNATURE THREAD: the splintered end of the displaced board.
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

### "Chevron" has to be described, not named

The style block names four outer shapes and the model knows three of them. Asked for a chevron it
draws a **shield** — `negative_split` a01 did exactly that, and a shield is the very shape the
block spends a sentence forbidding by another name. The word is the problem: on a patch, "chevron"
reads to the model as heraldry or as rank insignia, and the rank reading is the "award" register
the block rules out.

What works is a physical description, passed as a `--note` alongside the scene:

> The patch's outer silhouette is a CHEVRON: a broad arrowhead pointing downward, wide and
> straight across its top edge, its two sides running down and inward to meet at a single point at
> the bottom, with the bone merrowed border following that V shape the whole way round. It is not
> a shield and its bottom is a point, not a curve.

**This is deliberately NOT folded into the style block.** Doing so would bump it to v3 and
invalidate every badge already promoted under v2 — eighteen of them by the time this was
discovered — and `badges:check` treats a mixed deck as a failure rather than a warning. The note
travels in each chevron's `.txt` sidecar instead, which is exactly what the sidecar is for: the
prompt as sent, beside the image it produced. A future v3, made for its own reasons, should absorb
this paragraph into the PATCH section and drop the note.

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

**The post: down to two badges, after the full-shelf sheet said three was one too many.**
`redline_republic` (a flag on a bare pole) and `century_club` (a fence post wound in yarn) both
stand something upright and alone, and they stay distinct because the post is the subject in
neither — the torn fly and the wound ball are what the eye lands on, and those two silhouettes are
unlike. `double_century` used to be the third and no longer is; see the escalation-pair note
below. If a future revision needs one of the remaining two moved, `century_club` is the one: the
wound-yarn ball reads as a subject in its own right even without the post, and the prepared
alternative is the same ball resting loose in a wooden crate.

**century_club / double_century is a deliberate escalation pair, like `full_week`/`year_end` in
the reference deck, and it is watched the same way.** They share a theme (accumulated distance)
and a base object (a fence post) but not a silhouette — a compact wound ball against a stack of
sagging loops.

**This pair took two scene rewrites, and the second one is why the full-shelf sheet exists.**

The prepared alternative went first, and for a reason nobody predicted. Three attempts at the
original "two posts joined by bunting" line all drew a perfectly distinct picture — they never
converged with `century_club` at all. What failed was the SILHOUETTE: two posts side by side is an
inherently wide composition and it fought the rounded triangle every time (90.6% × 74.6%, then
85.2% × 73.8%, then a squat dome that was no longer a triangle). 9a and 8a traded failures across
all three. So the audit's standing alternative — a single post strung with two full loops — was
spent on aspect ratio rather than on collision, because it is naturally tall and narrow.

**And that fix caused the collision the note had been holding in reserve for.** A post wound in
two loops and a post wound in a ball of yarn are the same picture. Per-badge review passed it —
every hard check was green and the subject matched its scene — and the contact sheet caught it
immediately, with the two sitting four tiles apart in the same row. This is precisely the failure
mode §9 task 14 predicts: convergence is invisible one badge at a time and obvious with the whole
shelf in one line of sight.

`double_century` is now bunting with no post at all: one string hung from a single hook and folded
once, so two identical lengths of flags hang side by side. It keeps the "double" reading, it is
tall and narrow, and it takes the post tally to two.

Two lessons, both of which generalise past this badge:

**A scene's composition has an implied aspect ratio, and it must agree with the outer shape it was
assigned.** Anything wide belongs in a chevron or a hexagon; a rounded triangle wants a tall
subject with a narrow top.

**A prepared alternative can spend itself on the wrong problem.** When one is used for a reason
other than the collision it was written for, write the next one down before moving on — this note
had none in reserve the second time, and the replacement had to be invented under pressure.

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

## The records deck (F25)

Ten personal-record patches, one per key in `RECORD_CATALOG` — `lib/records/catalog.ts`, named in
`lib/records/labels.ts`. Same cloth, same border, same threads, same signature. Two things differ,
and both are here rather than in the shared block.

### The fifth silhouette rides in the scene line, and nothing else changes

Every record scene line ends `SHAPE: pentagon`, exactly the way each badge scene line ends
`SHAPE: shield` or `SHAPE: chevron`. That is the whole mechanism. **The records deck adds NOTHING
to the style block**, is sent STYLE BLOCK v2 verbatim like the badge deck, and stamps `v2` like
the badge deck — because that is literally what it was generated against.

This is not the design F25 started with, and the section below records what it cost to find out.

**Why a fifth shape at all.** The two decks appear in the same app and must be tellable apart at
the 56 px shelf size. Subject register alone does not do it — a viewer reads a silhouette before
they read a subject. A pentagon is the shape that pays for itself: it has a hexagon's generous
interior, so both wide subjects (a bounding hare) and tall ones (a candle) fit; its flat base gives
the standing subjects something to stand on; it is unmistakable against this deck's hexagon, which
presents its points left and right where the pentagon presents one apex up; and it is never
circle-adjacent, which an octagon would be — and "a plain circle in a square" is the one shape the
block forbids outright.

**Why not the obvious rounded diamond.** A diamond's usable interior is a narrow vertical spindle.
It would suit a candle and a plumb bob and fight a bounding hare and a kite on a long line — and
one shape has to carry all ten scenes. That is this file's own lesson, from the audit above: *a
scene's composition has an implied aspect ratio, and it must agree with the outer shape it was
assigned.*

### The scenes

```
<!-- SCENES:records -->
- longest_distance: A single large diamond kite riding high and filling the upper half of the patch, tilted on the wind, with one long taut line running unbroken from the kite all the way down to the bottom corner of the patch and a tail of bows streaming off it. SHAPE: pentagon. SIGNATURE THREAD: the lowest bow on the kite's tail.
- longest_duration: A single candle burned almost all the way down to its base, its flame still lit, standing in a deep wide pool of its own spilled wax. SHAPE: pentagon. SIGNATURE THREAD: the last unburnt fold of the wick, just below the flame.
- fastest_pace_5k: A single swift in a hard flat dive, seen from the side, its wings swept fully back along its body so the whole bird reads as one narrow dart. SHAPE: pentagon. SIGNATURE THREAD: the swift's eye.
- fastest_pace_10k: A single hare at full stretch in mid-bound, seen from the side, all four feet clear of the ground and its body stretched long from nose to hind foot. SHAPE: pentagon. SIGNATURE THREAD: the hare's leading forepaw.
- fastest_km_split: A single archer's bow at the instant of release, held upright, the arrow just clear of it and travelling, the bowstring still shivering in two or three loose curves. SHAPE: pentagon. SIGNATURE THREAD: the fletching at the back of the arrow.
- most_kcal: A single leather-and-wood bellows seen from the side, squeezed hard shut, with one short puff of air leaving its nozzle. SHAPE: pentagon. SIGNATURE THREAD: the brass ferrule at the tip of the nozzle.
- most_elevation: A single aerial cable-car cabin, a boxy riveted metal car with a row of square windows along its side, hanging by its arm from one taut steel cable that runs the whole width of the patch on a steep upward diagonal, with open air and nothing at all beneath the car. SHAPE: pentagon. SIGNATURE THREAD: the hanger arm where the car meets the cable.
- highest_cadence: A single spinning top at full speed, standing dead upright on its point, with one blurred ring of motion drawn around its widest part. SHAPE: pentagon. SIGNATURE THREAD: the steel tip the top is spinning on.
- highest_max_hr: A single heavy hanging bell caught in mid-strike, seen from the side, its clapper swung hard over and touching the inside of the bell's lip. SHAPE: pentagon. SIGNATURE THREAD: the clapper.
- best_paced_run: A single plumb bob hanging dead still and perfectly vertical on its line, the line running straight up to a small fixed hook above it. SHAPE: pentagon. SIGNATURE THREAD: the sharp point at the bottom of the bob.
- earliest_start: A single stovetop moka coffee pot standing alone, seen from the side, its faceted octagonal body stepping in sharply at the waist, its one curved handle and its short spout in clear profile, its lid closed and its body left entirely bare of any mark or medallion. SHAPE: pentagon. SIGNATURE THREAD: the small round knob on top of the lid.
<!-- /SCENES:records -->
```

Shape distribution: **pentagon** × 11. Uniform, unlike the badge deck's four — the shape is what
says "this is a record and not a badge", so varying it inside the deck would spend the very
distinction it was added to make.

### Measured: appending ANYTHING to the style block destroys subject adherence

The most expensive finding in either deck, and the least expected. **Twelve generations of one
record patch, `most_elevation`.**

F25's first design gave the records deck a per-deck **addendum** — a short region appended after
the shared style block, describing the pentagon — so that a fifth silhouette would not require
bumping the block to v3 and invalidating all 22 promoted badges. Sound reasoning; the block really
cannot be bumped (`check-badge-art.mjs` asserts every master's sidecar version against it). The
addendum was the wrong way to avoid it.

| # | aspect | seed | addendum | scene asked for | what came back |
|---|---|---|---|---|---|
| a01 | 4:3 | 1970 | full | one mountain peak | pepperoni pizza |
| a02 | 4:3 | 1970 | full | same, `--note` naming rock/snow | pepperoni pizza, better |
| a03 | 4:3 | 1970 | full | three jagged peaks | watermelon slice |
| a04 | 4:3 | 1970 | full | aerial cable car | pepperoni pizza |
| a05 | 4:3 | 4711 | full | aerial cable car | traffic cone |
| a06 | 4:3 | 4711 | reframed | aerial cable car | winged doughnut |
| a07 | 1:1 | 4711 | reframed | aerial cable car | pepperoni pizza |
| — | 1:1 | 1970 | *(badge deck control)* | `dawn_patrol` lighthouse | **a perfect lighthouse** |
| a08 | 1:1 | 1970 | one sentence | aerial cable car | doughnut |
| a09 | 1:1 | 1970 | one sentence | aerial cable car | pepperoni pizza |
| a10 | 1:1 | 1970 | **none** | aerial cable car | **an aerial cable car** |
| a11 | 1:1 | 1970 | **none** | aerial cable car | **an aerial cable car** |
| a12 | 4:3 | 1970 | **none** | aerial cable car | **an aerial cable car** |

**Every hard check passed on the pizzas.** Geometry, twill tone, palette agreement, signature-thread
share, weave texture, patch centring, and 9a patch width all read green while the picture was a
slice of pizza. This is the sharpest demonstration anywhere in this project of why step 5 of the
skill — *look at it* — is mandatory and not ceremonial. No number here can see a subject.

**The diagnosis took four wrong turns, all of them plausible:**

1. *The wedge.* An apex-up pentagon invites a wedge and a wedge is a pizza slice. So the scene
   became three jagged peaks. Result: watermelon.
2. *The correction wording.* `a02`'s note named materials physically as step 6 prescribes — *sunlit
   rock in marigold gold, shadowed rock in cardinal red, a bone-white snow cap* — and every one of
   those maps onto a pizza ingredient, so naming them harder made the pizza better. True, and not
   the cause.
3. *Landform versus made object.* The deck's subject palette is red, green, gold and bone, which is
   a fruit bowl; the 22 badges escape it because their subjects are manufactured things with hard
   mechanical outlines. So the scene became a riveted cable car. Result: pizza again.
4. *The aspect ratio, the seed, the subject label.* All three were varied. `a05` (new seed) escaped
   food but produced a traffic cone; `a07` (square) was pizza; relabelling `SUBJECT FOR THIS PATCH`
   to `SUBJECT FOR THIS BADGE` changed nothing.

**The control is what closed it.** Regenerating a known-good badge on the documented path returned
a flawless lighthouse — correct shield, correct beam, 9a drift 0.2%. The pipeline, the model and
the style block were all fine. The only substantial thing the records prompt added was the
addendum, and removing it fixed the subject on the very next generation, at both aspect ratios.

**Why it should not have mattered, and the rule that follows.** The addendum was four lines of
plain prose appended after an 8,000-character block, and at its smallest it was a single sentence
naming a shape. It still broke the scene completely. Whatever the mechanism — a contradiction with
the block's own enumerated shape list, or simply that text between the block and the subject
displaces the subject — the operational rule is blunt and worth more than the explanation:

> **Send STYLE BLOCK v2 verbatim, and put every per-patch instruction in the scene line or in
> `--note`. Do not append anything to the block for any reason.**

That is the same conclusion the chevron note above reached from a different direction, and the two
should be read together. It also means a genuinely new style contract has to be a **v3 bump with
the whole deck regenerated** — there is no cheap middle path, and F25 spent twelve generations
proving the middle path does not exist.

### The collision audit, extended to thirty-three patches

Done at design time, against the badge deck's audit above rather than only against these ten.

kite-on-a-long-line / burnt-down candle / diving swift / bounding hare / bow at release / squeezed
bellows / switchbacked peak / spinning top / struck bell / hanging plumb bob / moka coffee pot.

Still true across both decks: **no shoes, no medals, no stopwatches**, and no clock, watch face,
gauge, scale or numeral anywhere. That last rule is why `longest_duration` is a candle and not an
hourglass, and why `highest_max_hr` is a bell and not a dial — "how long" and "how hard" are the
two records that pull hardest toward a timepiece, which the badge deck's scene rules already
forbid outright.

Three adjacencies were found and are recorded rather than hoped away:

**`longest_duration` is the deck's second flame, after `fast_start_fool`'s spent match.** They are
kept apart on silhouette, the way `metronome` and `boring_excellence` are: a tall taper standing
upright in a wide pool of wax against a matchstick lying flat on a diagonal with its flame already
collapsed. One is vertical and lit, the other horizontal and going out.

**`fastest_pace_5k` is the second bird, after `early_bird`'s rooster.** The rooster is perched
still, in profile on a rail, neck stretched up into a sun disc; the swift is airborne with its
wings swept back to a dart. A perched bird and a diving bird are different silhouettes at 40 px,
which is the test that matters.

**`earliest_start` is a vessel, after `most_kcal`'s bellows, and it is the deck's fourth adjacency.**
F32 added it, and the two are kept apart the way the deck's two flames are: the bellows is a wide
horizontal wedge lying along its own handles with a puff leaving its nozzle, the moka pot a tall
stacked tower standing dead upright with nothing leaving it. **The pot emits nothing on purpose** —
one curl of steam would have made two "vessel with something coming out of it" patches, which is the
category the audit watches rather than the object.

The three objects F32 rejected are recorded here because each is the obvious answer and each is
wrong for a reason that will recur. **A clock or an alarm clock**: the literal picture of "earliest
time" is the one this deck cannot draw, by the no-dial rule three paragraphs up — it is the same
reason `longest_duration` is a candle. **A rooster, an owl or a sunrise**: `early_bird` is already a
rooster crowing into a sun disc, and a second dawn bird is the same patch. **A milk bottle on a
doorstep**: the right idiom, but a bottle pulls a printed dairy label, and lettering is the single
likeliest reason this style burns an attempt.

**`best_paced_run` is the closest of the three, and it is a trueness instrument like
`boring_excellence`'s spirit level.** Both say "steady" without a dial, which is exactly the pair
`metronome`/`boring_excellence` was already watched for. They are separated on axis and on shape —
a plumb bob is vertical in a pentagon, a spirit level is horizontal in a chevron, close to opposite
readings at shelf size. Per this file's own lesson that *a prepared alternative can spend itself on
the wrong problem*, the reserve is written down now rather than invented under pressure: **a
carpenter's chalk line snapped taut between two pins, with one clean struck line on the ground
below it.**

**`fastest_pace_5k` / `fastest_pace_10k` is a deliberate escalation pair**, like
`century_club`/`double_century`. They share a theme — pure speed over a qualifying distance — and
must not share a picture. A swift and a hare are different animals in different media moving in
different planes, which is a wider gap than that badge pair needed.

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
