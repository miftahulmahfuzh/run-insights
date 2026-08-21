# F15 — The badge master's aspect ratio

> **Fixes:** the two twill seams either side of the art in `BadgeDialog`, introduced by F12 when it
> put F10's square masters into a 4:3 band.
> **Depends on:** F10 (`assets/badges/**`, `tools/gen_badge_art.py`, `tools/check_badge_art.py`,
> `tools/make_badge_assets.py`, the `generate-badge` skill, `style.md`), F12 (`BadgeDialog`'s band).
> **Owns:** the masters' shape, `tools/extend_badge_art.py`, check 1 and check 9a's expectation, the
> two derivative routes out of a master, and the `.wNN` promotion step in the skill.
> **Does NOT touch:** `style.md`'s style block or its version, any scene line, any `SHAPE_WIDTH`
> number, `BADGE_CATALOG`, any badge's condition, or what a badge means. Every one of the 22
> pictures is the same picture. This is a change to the cloth around them.

---

## 1. The defect, measured

`BadgeDialog`'s art band is `aspect-[4/3]`. Every F10 master is 1024². So the dialog drew the
square art `h-full w-auto max-w-none` and painted the ~12.5% of band either side with
`BADGE_ART.twill` — the mean of that master's outer 5% frame, sampled by `make_badge_assets.py`.

F12's own comment argued the case for painting rather than cropping, and that half was right: the
patch must never be cut to fill a rectangle. What it missed is that **a flat mean cannot match a
photograph of cloth in two ways at once.**

**The light.** `style.md`'s style block asks for "one hard, raking light from the upper left, low
and directional". It got one. So every master's left edge is lighter than its right, and the frame
mean lands between the two — wrong at *both* seams rather than at neither. Measured as
|left-edge mean − frame mean| and |right-edge mean − frame mean|, in sRGB grey, over all 22:

| badge | left | right | | badge | left | right |
|---|---|---|---|---|---|---|
| two_a_days | **12.4** | 7.1 | | dawn_patrol | 5.4 | 2.2 |
| boring_excellence | **9.8** | 3.5 | | consistency_gremlin | 5.4 | 1.9 |
| century_club | 2.4 | **8.5** | | negative_split | 5.3 | 1.0 |
| sweat_equity | **8.4** | 2.1 | | long_way_home | 4.9 | 1.7 |
| fast_start_fool | 7.5 | 1.4 | | self_reward | 4.8 | 2.4 |
| groundhog_day | 7.1 | 2.2 | | half_ish | 4.6 | 2.3 |
| redline_republic | 6.4 | 1.6 | | warmup_who | 4.6 | 2.8 |
| late_start | 6.3 | 1.2 | | metronome | 4.6 | 1.8 |
| double_century | 6.3 | 2.8 | | early_bird | 4.2 | 2.6 |
| sandbagger | 2.9 | 5.9 | | new_ceiling | 3.9 | 2.5 |
| | | | | cadence_collapse | 3.2 | 3.3 |
| | | | | tourist | 3.0 | 1.7 |

**The grain.** The style block also asks the twill for "a visible diagonal weave — the fabric's own
grain must read under the raking light as fine, regular texture, not a flat digital navy fill", and
`check_badge_art.py`'s check 10 gates that it is there. A flat fill has none. So the join reads as
*texture-stops-here* even on `tourist` and `cadence_collapse`, where the value nearly matches.

Neither half is fixable by sampling better. There is no single colour that is two colours.

---

## 2. The fix, in one sentence

**Make the master the band's own shape, so the band has nothing to paint.**

`tools/extend_badge_art.py` widens each approved 1024² master to 1024×768 by extending *that
badge's own cloth* sideways — an outpaint, not a re-generation. `BadgeDialog` then draws the art
at `h-full w-full object-cover` into a 4:3 band and there is no seam to match, because there is no
join.

### 2.1 Why this is an outpaint and not `gen_badge_art.py --aspect-ratio 4:3`

Two independent reasons, and either alone would settle it.

**The 22 pictures are approved.** Each one cost up to three attempts and a human reading three
crops. Re-rolling them for a change about cloth would be spending that budget again to get
different art, which is not what anyone asked for.

**The composition rules are calibrated for a square.** The style block asks for a patch "occupying
about 80 percent of the image width" with "a generous margin of bare twill … on every side", and
all four `SHAPE_WIDTH` numbers in `check_badge_art.py` were *observed* on square frames. Generating
at 4:3 invalidates every one of them at once and leaves nothing to grade against.

So a badge is **invented square and then widened**, and `gen_badge_art.py` keeps sending
`aspect_ratio: "1:1"` deliberately. §5 records what that costs.

### 2.2 Why `input_references` is right here and wrong there

The `generate-badge` skill's step 2 records a measured reversal of its own design plan:
`input_references` on this provider "behaves like a strong img2img, not a style reference: it
transfers the **subject** hard and the **cloth tone** not at all." That made the anchor fatal as a
generation input — a01 and a02 for `self_reward` redrew the anchor's rooster.

That is the exact behaviour this operation wants. The subject must transfer hard, because it is
approved; the cloth is what is being replaced anyway. **The finding is not contradicted, it is
used.** Which is why this is a separate tool with the reference *required*, rather than a flag on a
tool where the reference is a documented mistake.

### 2.3 Why the cheap model

`gen_badge_art.py` pins `qwen/qwen-image-3-pro` because it is inventing a picture. Copying one
across a wider canvas is a much easier ask, so this pins plain `qwen/qwen-image-3`.

**Measured at $0.033 per call**, by differencing OpenRouter's credit ledger before and after —
`/images/generations` returns no `usage` block on this provider and image models are absent from
`/api/v1/models`, so their `pricing` cannot be read either. The ledger diff is the only number
that is actually the bill.

**The ledger is eventually consistent, and the tool's per-badge poll can lose a call to that.** The
22-badge run printed `$0.660000 over 21 image(s)` where 21 × $0.033 is $0.693 — one call's charge
landed after its own poll window closed and was picked up inside the next badge's. The authority is
the session total: the account went from $5.3268801 to $6.0858800, which is **$0.759000 for 23
generations at exactly $0.033 each** — the 22 that shipped plus the one discarded first attempt on
`two_a_days`. Trust the endpoints of a run, not the sum of its per-call diffs.

---

## 3. The crop, and why the output is not shipped as generated

The model returns the patch at roughly 68% of frame height where the square masters read ~87% of
width, so as generated the patch is about a fifth smaller in the panel than the deck it must sit
in. Prompting does not fix it — measured on `two_a_days`, asking for "eighty percent" of frame
height produced 66.0% and asking for "eighty-eight percent" produced 68.0%.

So the size is fixed by arithmetic. `crop_to_deck_size` measures the patch's bounding box with
`check_badge_art.foreground_box` — **imported, not reimplemented**, so the crop cannot be computed
against a different notion of foreground than the one check 9a gates on — and centre-crops the
frame by exactly the factor that lands the patch on its own shape's expectation. The crop is
centred on the *patch* rather than on the frame, so it improves check 8a instead of inheriting
whatever offset the generation had, and it is clamped to the frame.

**This is a crop of cloth the model drew, not an upscale of the patch.** Worst case is ~1.2× of a
1K generation and the shipped derivative is 768 wide, so the round trip is a net downscale. Below
`CROP_FLOOR = 0.70` the tool refuses and says to re-roll, because at that point it would be
rescuing a failed generation rather than trimming a good one.

The raw generation is kept as `<key>.wNN.raw.png` and `--all --recrop` re-derives every candidate
from the raws in place, free. A re-crop is *not* a new attempt number: the pixels the model
returned are identical, and numbering it again would read as money spent twice.

### 3.1 The arithmetic that made this cheap

`SHAPE_WIDTH`'s four numbers are **not re-derived**, and check 9a gained a factor rather than a
second table:

```py
expected = SHAPE_WIDTH[shape] * h / w
```

They were observed as a fraction of image *width* on square masters — where a frame's width and
its height are the same number, so "the patch occupies 87.3% of the cloth" was measurable either
way and width was simply the one picked. On 4:3 the two stop agreeing, and **height** is the one
that matters, because `BadgeDialog` draws the master to fill the band and what sets the patch's
apparent size is its height as a fraction of the frame's. Multiplying by `h/w` converts the
observed number into the same physical patch on a wider frame — which is what the crop targets, so
the tool and the checker agree by construction rather than by coincidence.

On a square master `h/w` is 1 and check 9a is unchanged, which is the reason it is a factor.

### 3.2 What this costs check 9a, stated plainly

`crop_to_deck_size` crops *to* check 9a's expectation, so on a widened candidate **check 9a is
close to tautological** — it will report a drift near zero because the tool aimed at the number the
check grades. It is no longer independent evidence that the patch came back the right size.

This is a real loss and it is accepted rather than worked around, for two reasons. The check still
fires on the case that matters: `CROP_FLOOR` refuses any generation needing more than a 30% crop,
so a grossly shrunken or oversized patch is a hard stop in the tool *before* the checker sees it,
with a message saying to re-roll. And the number is not thrown away — the crop factor is printed
and written into every sidecar's `crop:` line, so "how far off was this generation" stays
answerable per badge, which is what 9a was actually telling us.

**The number to watch is the crop factor, not 9a's drift.** Observed across the deck: §9.

The alternative — grade first, crop second, and gate on the pre-crop measurement — is the more
correct design and it is not built, because it needs a second measurement pass and a place to keep
the pre-crop number where a checker can see it. If the crop factors ever cluster near the floor,
build it.

---

## 4. The two derivative routes, and the identity that made the shelf free

`make_badge_assets.py` now takes different routes out of one master:

- **`src`** — the panel — keeps the master's 4:3 at 768×576. `BadgeDialog` paints nothing.
- **`small`** — the shelf mark — is a **centre square crop**, at 192². `BadgeShelf`'s tile is
  square and neither letterboxing (which shrinks the patch inside its own tile) nor squashing
  (which distorts a hexagon) is acceptable there.

The crop is exactly a no-op on the deck's geometry. The patch on a 4:3 master spans
`SHAPE_WIDTH × 3/4` of 1024 px; cropping to the central 768×768 divides by that same 3/4; so the
mark's patch fraction comes out at `SHAPE_WIDTH` — the number the square masters had. **The shelf
is the same composition it always was, which is why F15 touched no shelf code.**

---

## 5. What F15 pays for this

Recorded because it is a real cost and a future reader will want it weighed rather than discovered.

- **A badge is now two generations, not one**: the square invention at ~$0.04 on the pro model,
  plus the widening at $0.033 on the cheap one. About $0.073 a badge, up from $0.04.
- **A badge is now two judgements, not one.** The square candidate is judged against skill step 5,
  then the widened one is judged again — the patch must be the *same* patch. The skill's step 3b
  and step 4 say so.
- **`_candidates/` holds twice the files**, plus a `.raw.png` per attempt. It is gitignored.

What it does *not* pay: no style-block change, so no version bump and no mixed deck. The widened
sidecar **inherits `style version:` from its source's sidecar** rather than re-reading `style.md`,
for the same reason `make_badge_assets.py` reads it from the sidecar in the first place — taking
the current version would stamp every badge "the version now" and make a mixed deck undetectable.

---

## 6. Three latent bugs this surfaced

All three were invisible while every master was square, and all three are in
`check_badge_art.py`'s "LOOK AT IT" crops — the artefacts a human judges from. A wrong crop does
not fail a check; it quietly makes the review worthless.

| where | bug | consequence on a 4:3 master |
|---|---|---|
| `write_theme_strip` | resized to `(s, s)` | the panel cell squashed a hexagon into a square |
| `write_ring_crop` | `cx = cy = (w - 1) / 2` | unrolled the edge around a point 128 px *below* the patch, so the band crossed the merrowed border at the top and bare twill at the bottom |
| `write_centre_crop` | `c = (w - 1) / 2` for both axes | cropped a square from below the subject |

The theme strip's fix also made it more honest than it was: the 40px cell is now the **centre
square crop**, which is what `BadgeShelf` actually draws, and the panel cell is 360×270 — the real
css size of `BadgeDialog`'s band — rather than a 220² box that matched nothing.

---

## 7. What must be true afterwards

1. Every `assets/badges/<key>.png` is exactly 1024×768, and `check_badge_art.py` check 1 asserts it.
2. Every one of the 22 is the *same patch* as the master it was widened from, judged by eye.
3. No badge gained lettering, a shadow on the bare cloth, or a second subject.
4. `check_badge_art.py` passes every hard check on all 22.
5. `npm run badges:check` and `npm run typecheck` pass.
6. `assets/badges/_anchor.png` is the widened `early_bird`, so check 9b's baseline is the same
   medium as the candidates it grades.
7. `BadgeShelf` renders identically to before, by §4's identity.

---

## 8. Out of scope

- **Regenerating any badge's art.** Every subject, silhouette and signature thread is F10's.
- **Any `style.md` change.** Not the style block, not a scene line, not the version.
- **Re-deriving `SHAPE_WIDTH`.** §3.1's factor is the whole change; the four numbers stand.
- **Tightening any band in `check_badge_art.py`.** Its header's rule holds: bands are gross-failure
  catches, and a threshold that fails on something harmless is one somebody comments out.
- **Dropping `BADGE_ART.twill`.** `BadgeShelf` still needs it for real, and `BadgeDialog` keeps
  painting the band behind the image so a slow decode shows cloth rather than card.

---

## 9. The deck, as converted

Filled in from the run rather than predicted. `crop` is `crop_to_deck_size`'s factor — how much of
the generated frame survived, and therefore how far off the generation's own patch size was. `d` is
the mean per-channel difference between the old square master and the widened master's centre
square crop, on a 256² downsample: the fidelity proxy, low is faithful.

| badge | crop | bound by | patch box (w×h of frame) | fidelity `d` |
|---|---|---|---|---|
| `metronome` | 0.703 | height | 58.3×90.0 | 22.0 |
| `warmup_who` | 0.725 | height | 56.6×90.0 | 16.9 |
| `long_way_home` | 0.743 | width | 58.4×79.9 | 15.4 |
| `early_bird` | 0.772 | width | 60.8×89.1 | 19.3 |
| `sweat_equity` | 0.802 | width | 63.3×83.8 | 20.5 |
| `self_reward` | 0.810 | width | 60.8×88.2 | 17.4 |
| `fast_start_fool` | 0.817 | width | 65.5×81.7 | 21.5 |
| `two_a_days` | 0.841 | width | 65.5×80.3 | 21.6 |
| `new_ceiling` | 0.842 | height | 60.3×90.0 | 16.4 |
| `consistency_gremlin` | 0.850 | width | 58.4×88.7 | 16.0 |
| `late_start` | 0.859 | width | 65.5×81.8 | 21.2 |
| `sandbagger` | 0.864 | height | 57.4×90.0 | 28.6 |
| `double_century` | 0.877 | height | 53.9×90.0 | 17.3 |
| `century_club` | 0.881 | height | 59.0×90.0 | 27.5 |
| `dawn_patrol` | 0.881 | width | 60.8×89.1 | 16.6 |
| `tourist` | 0.882 | width | 63.3×78.4 | 13.9 |
| `cadence_collapse` | 0.890 | height | 61.0×90.0 | 22.1 |
| `boring_excellence` | 0.901 | width | 63.3×72.4 | 13.7 |
| `groundhog_day` | 0.919 | width | 65.5×79.5 | 22.0 |
| `half_ish` | 0.919 | width | 65.5×81.6 | 22.9 |
| `redline_republic` | 0.924 | width | 58.4×82.5 | 28.0 |
| `negative_split` | 0.963 | width | 63.3×77.9 | 19.0 |

**crop** 0.703–0.963, mean 0.848. **`d`** 13.7–28.6, mean 20.0. **7 of 22** were bound by the
height ceiling rather than by the width target.

**No badge came near `CROP_FLOOR`.** `metronome` at 0.703 is the closest and it is bound by the
height ceiling, not by a shrunken patch — a rounded triangle at the width target is simply a tall
patch. So the floor never fired and §3.2's "if the crop factors cluster near the floor, build the
grade-then-crop design" has not triggered.

**`d` does NOT rank redraws, and this is worth knowing before anyone trusts it again.** The four
highest — `sandbagger` 28.6, `redline_republic` 28.0, `century_club` 27.5, `cadence_collapse` 22.1
— were each read at 380 px against their old master and are the *same patch*: `cadence_collapse`
keeps the red rail, gold rungs, green rail and the orange bolt at the crossing; `redline_republic`
keeps the green chain-stitch pole and the orange flame at the hoist; `double_century` keeps both
strings of pennants and the orange mark on the bottom-left red one. What `d` actually measures is
dominated by the **reposition** — the crop moves and rescales the patch by up to 30% — plus the new
cloth's own lighting. It is a triage order for where to look first, not a verdict, and on this deck
every one of the 22 passed the looking.

### 9.1 What the eyes found that the checks did not

- **No lettering, on any of the 22.** All 22 patch edges were unrolled onto one sheet and read as
  lines rather than arcs, which is the only form in which a ring of half-formed serifs is obvious.
  Nothing measures this (see the checker's `NOT_MEASURED`), so it is recorded here as having been
  done rather than assumed.
- **No badge gained a subject, an object, or a second patch.**
- **Every outer silhouette is the one its scene names**, and the four shapes still read apart at
  40 px on both `--paper` values.
- **A faint soft shading survives in a corner on a few badges** — `two_a_days` bottom-left,
  `half_ish` upper-left. Check 3's `spread` catches the gross version of this and passed on all 22
  after the height ceiling landed; what remains is at the level of the cloth's own fall of light
  and is not worth a re-roll.

### 9.2 A side effect worth having

The shipped panel is 768×576 instead of 768², so it carries 25% fewer pixels. `public/badges/`
went from ~6.2 MB to **3.8 MB** — the panels dropped from ~279 kB to ~158 kB each at the same
`quality=90`. Nothing was traded for it.

