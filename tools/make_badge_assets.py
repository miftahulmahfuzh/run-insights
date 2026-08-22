#!/usr/bin/env python3
"""Promote approved masters to shipped assets, and regenerate the manifest.

    python3 tools/make_badge_assets.py
    python3 tools/make_badge_assets.py --dry-run
    python3 tools/make_badge_assets.py --lossless

Design record: docs/plans/F10-badge-art-skill.md §5.4, and D12 (offline
generation, committed, no runtime image calls).

  assets/<deck>/<key>.png                1024×768 PNG, lossless, never edited in place
    → public/<deck>/<key>.<hash8>.webp     768×576  — the panel, the master's own 4:3
    → public/<deck>/<key>.<hash8>.sm.webp  192²     — the shelf mark, a CENTRE SQUARE CROP
    → the deck's manifest module            a TOTAL Record

THE MASTERS ARE 4:3, AND THE TWO DERIVATIVES TAKE DIFFERENT ROUTES OUT OF THEM.

F10 shipped 1024² masters against a `BadgeDialog` band that is `aspect-[4/3]`, so
the dialog drew the square art `h-full w-auto` and painted the ~12.5% of band
either side with `BADGE_ART.twill`, the mean of the master's outer frame. That
mean is wrong at both seams at once — the style block's light rakes from the upper
LEFT, so each master's left edge is up to 12.4 sRGB lighter than its right — and a
flat fill has no weave grain, so the seam showed as texture-stops-here even where
the value matched. `tools/extend_badge_art.py` converted the deck; its header
carries the full argument and the per-badge measurements.

So `src` is now the master's own 4:3, and the panel paints nothing. But the SHELF
mark is square — `BadgeShelf` draws it in a square box at 56 css px — and neither
letterboxing (which shrinks the patch inside its own tile) nor squashing (which
distorts a hexagon) is acceptable there. It is a centre square crop instead, and
that crop is exactly a no-op on the deck's geometry: the patch on a 4:3 master
spans `SHAPE_WIDTH × 3/4` of 1024 px, and cropping to the central 768×768 divides
by that same 3/4, so the mark's patch fraction comes out at `SHAPE_WIDTH` — the
number the square masters had. The shelf is bit-for-bit the same composition it
always was, which is why this change touched no shelf code.

TWO DECKS NOW, AND THE TABLE IS BACK. This paragraph used to read: "Run Insights
has only the badge shelf, so the table is four module constants. If a second deck
ever appears, restore the abstraction then." F25 is that second deck — ten
personal-record patches — so it was restored, as `tools/decks.py`. It is ONE
table rather than one per tool: `gen_badge_art.py`, `check_badge_art.py`, this
file and `scripts/check-badge-art.mjs` all need the same answer to "where do this
deck's masters live", and four private copies of that answer are four chances to
disagree with nothing checking in between. `--deck` defaults to `badges`, so
every command written down in F10's plan and in the skill still means what it
said.

THE SKILL NEVER RUNS THIS. Regenerating public/** changes what ships. Because
filenames are content-hashed the change is *safe* — new bytes, new hash, new
filename, every cache in the world misses correctly — but it is still a change
to the shipped app, and it belongs in its own commit alongside
`npm run badges:check` and `npm run typecheck`.

WHY THE HASH IS IN THE FILENAME. `next.config.ts` serves /badges/* as
`immutable` with a one-year max-age, which is only safe because a regenerated
image lands at a different URL. Slug-named art plus an immutable header is how
every existing install keeps the old picture for up to a year after a
regeneration; content-hashed names make that impossible rather than merely
documented.

WHY THE Record IS TOTAL. `Record<BadgeKey, BadgeArt>`, never `Partial<>`. Adding
a 23rd key to BADGE_CATALOG without generating its art fails `npm run typecheck`
in the same session, before anything ships. That failure is the feature, and it
costs one keyword. It is also the second of gen_badge_art.py's three drift
mechanisms; the third is `npm run badges:check` (art with no key).

PIL only, like its two neighbours.
"""

import argparse
import hashlib
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(Path(__file__).resolve().parent))
from decks import add_deck_argument, deck_for  # noqa: E402

MASTER_W, MASTER_H = 1024, 768
# The panel derivative keeps the master's 4:3 exactly. 768 wide, not 768 tall:
# the measured quality table below was taken at 768 across, and width is what
# `BadgeDialog`'s 360 css px band actually consumes.
PANEL_W, PANEL_H = 768, 576
# 192, for a shelf mark `BadgeShelf` currently draws at 56 css px — 3× on a
# phone, with room for a future panel that draws it larger. It costs about 2 kB
# over a tighter size and lets a consumer draw it smaller, which is always safe.
SMALL = 192
QUALITY = 90
METHOD = 6
# MEASURED, 22 badges, style v2, against the master downsampled to the 220 css px
# a panel actually draws (the acceptance test this comment used to only ask for):
#
#   quality  kB @768²   max diff / 255   mean diff / 255
#   90       279        12               1.11
#   85       230        13               1.31
#   78       184        18               1.56
#   65       150        21               1.80
#
#   panel px kB @q90    max diff / 255   mean diff / 255
#   768      279        12               1.11
#   640      195        16               1.28
#   512      123        21               1.47
#
# quality=90 at 768² is kept. There is no ringing on the merrowed border and no
# cliff anywhere in either curve — the whole q90→q65 range moves the mean by
# 0.7/255 — so nothing here is being paid for a visible defect.
#
# The prediction in the plan held: a satin-stitch patch carries far more
# high-frequency texture than the line engraving this pipeline descends from, and
# its files are roughly 2x that deck's 96–154 kB at the same setting. 22 panels
# is ~6.2 MB.
#
# WORTH KNOWING BEFORE ANY FUTURE TUNING: nothing fetches the 768² derivative
# today. `BadgeShelf` draws the 192² mark at 56 css px (~13 kB each); the panel
# size is provisioned for a badge detail view that does not exist yet. If that
# view never ships, dropping PANEL to 512 saves 56% for a max difference of
# 21/255 at the draw size — a decision to make when there is a screen to judge it
# on, not now. Content-hashed filenames make it free whenever it happens.
#
# `--lossless` remains one flag away if a future style block makes the stitch finer.

# The catalog is the single source of truth for the key set, and the shape of one
# entry differs per deck — `badge('key', …)` in F09's, `key: '…'` in F06's — so
# the pattern travels with the path in `decks.py` rather than living here.
#
# `v\d+` alone no longer matches every version. The records deck stamps a
# composite `v2+records1`, because bumping the shared style block would have
# failed `npm run badges:check` on all 22 promoted badges for a change that adds
# a silhouette the badge deck does not use. See decks.py's header.
STYLE_VER_RE = re.compile(r"^style version:\s*(v\d+(?:\+[a-z0-9]+)?)\s*$", re.M)


def deck_keys(deck):
    """Every key in this deck's catalog, in catalog order — which IS shelf order."""
    source = deck.catalog_path()
    if not source.exists():
        sys.exit(f"error: no {deck.noun} catalog at {source}")
    m = re.search(rf"{deck.catalog_array}[^=]*=\s*\[(.*?)^\]",
                  source.read_text(encoding="utf-8"), re.S | re.M)
    if not m:
        sys.exit(f"error: could not find `{deck.catalog_array} … = [ … ]` in {source}")
    keys = re.findall(deck.key_pattern, m.group(1), re.M)
    if not keys:
        sys.exit(f"error: {deck.catalog_array} in {source} parsed to zero keys")
    return keys


def style_version_for(deck, key):
    """The style version this master was generated against — from its sidecar.

    NOT from style.md's current version. Reading the current version here would
    stamp every image "the version now" and make a mixed set undetectable, which
    is the exact thing the version stamp exists to catch.

    The sidecar arrives by promotion: `gen_badge_art.py` writes `<key>.aNN.txt`
    beside every candidate, and the promotion step copies BOTH files. A master
    with no sidecar is recorded "unknown" and warned about rather than guessed at.
    """
    sidecar = deck.masters_dir() / f"{key}.txt"
    if not sidecar.exists():
        return None
    m = STYLE_VER_RE.search(sidecar.read_text(encoding="utf-8"))
    return m.group(1) if m else None


def twill_hex(img):
    """The art's own twill, `#rrggbb`, as the mean of the master's outer 5% frame.

    The same region and the same rule `check_badge_art.py`'s `substrate_stats`
    uses, so the promoted value and the graded value can never disagree. That
    frame is bare cloth by construction: the style block's FULL BLEED rule makes
    the image the twill, and check 3 gates all four edge strips.

    Sampled, never chosen. Regenerating an image can shift its twill, and the
    style block asks for "near #1B2A44" rather than for that exact value —
    a generated navy is what the shelf must match, not a hex from a document.
    Sampled from the 1024² master rather than the 768² derivative so that this
    field and `sha256` describe the same bytes.
    """
    px = img.convert("RGB").load()
    w, h = img.size
    band = max(1, int(round(min(w, h) * 0.05)))
    rs, gs, bs = [], [], []
    for y in range(h):
        edge_row = y < band or y >= h - band
        for x in range(w):
            if not (edge_row or x < band or x >= w - band):
                continue
            r, g, b = px[x, y]
            rs.append(r)
            gs.append(g)
            bs.append(b)
    n = len(rs)
    return "#%02x%02x%02x" % (round(sum(rs) / n), round(sum(gs) / n), round(sum(bs) / n))


def emit_manifest(deck, entries, style_versions):
    """The deck's manifest module, as text.

    DECK-AWARE PROSE, NOT A TEMPLATE WITH THE NOUNS SWAPPED. The `twill` and
    `small` fields do different jobs in the two decks — the badge shelf paints a
    square tile behind a square mark, the record panel does not have a shelf at
    all yet — so each deck's docblock says what is true for it. Regenerating the
    badge deck with this function produces the file that was already on disk,
    byte for byte; that is the property to preserve when editing here.
    """
    versions = sorted({v for v in style_versions.values() if v})
    ver_note = (
        f"generated against style {versions[0]}"
        if len(versions) == 1
        else f"MIXED STYLE VERSIONS: {', '.join(versions)}"
        if versions
        else "style version unknown"
    )
    cmd = "python3 tools/make_badge_assets.py"
    if deck.name != "badges":
        cmd += f" --deck {deck.name}"

    if deck.name == "badges":
        small_doc = [
            f"  /** {SMALL}×{SMALL} WebP for the shelf mark, drawn at 56 css px. A CENTRE",
            "   *  SQUARE CROP of the master, not a squash of it: the shelf tile is square,",
            "   *  and the crop restores exactly the patch fraction the square masters had. */",
        ]
        twill_doc = [
            "  /**",
            "   * The patch's own twill, `#rrggbb`, as the mean of the master's outer 5% frame.",
            "   * A tile can paint its own background with this so the square art sits inside a",
            "   * rounded field with no seam and no crop. Sampled from the master, never chosen;",
            "   * `npm run badges:check` recomputes it exactly as it recomputes `sha256`.",
            "   *",
            "   * `BadgeShelf` still needs this: its tile is square and `small` is square, so",
            "   * the rounded field around a 56px mark is still painted rather than drawn.",
            "   * `BadgeDialog` no longer does — `src` is the band's own 4:3 and fills it — but",
            "   * it keeps painting the band behind the image anyway, so a slow decode shows",
            "   * cloth rather than card.",
            "   */",
        ]
    else:
        small_doc = [
            f"  /** {SMALL}×{SMALL} WebP, a CENTRE SQUARE CROP of the master rather than a squash",
            "   *  of it — a squashed pentagon is a different silhouette, and the silhouette is",
            "   *  what tells a record patch from a badge at shelf size.",
            "   *",
            "   *  GENERATED EVEN IF NOTHING DRAWS IT YET. F25 ships this whether or not F26's",
            "   *  one-line record row shows a thumbnail, because it is free at generation time",
            "   *  and expensive afterwards: adding it later means regenerating every master's",
            "   *  derivatives, which changes every content hash and every shipped filename. */",
        ]
        twill_doc = [
            "  /**",
            "   * The patch's own twill, `#rrggbb`, as the mean of the master's outer 5% frame.",
            "   * Sampled from the master, never chosen; `npm run badges:check` recomputes it",
            "   * exactly as it recomputes `sha256`.",
            "   *",
            "   * Use it to paint the field behind the art, so a slow decode shows cloth rather",
            "   * than card, and so a square consumer of `small` gets a seamless surround. Both",
            "   * decks are one bolt of cloth, but these values are per patch and are NOT",
            "   * interchangeable with the badge deck's — the raking light makes each master's",
            "   * own frame its own colour.",
            "   */",
        ]

    lines = [
        "/**",
        " * GENERATED FILE — do not edit by hand.",
        " *",
        f" *   {cmd}",
        " *",
        f" * Source art is `{deck.masters}/<key>.png`; these are its derivatives.",
        f" * Every entry here is {ver_note}.",
        " *",
        f" * This is a TOTAL `Record<{deck.key_type}, {deck.art_type}>` on purpose. A key added to",
        f" * {deck.catalog_array} with no art fails `npm run typecheck` immediately, in the same",
        " * session, before anything ships — a far stronger guarantee than a check script",
        " * nobody runs, and it costs one keyword. The fix for that failure is to generate",
        " * the art, not to reach for `Partial<>`.",
        " *",
        " * Filenames carry the first 8 hex of the master's SHA-256. Regenerating an image",
        " * changes its bytes, its hash and its filename, so every cache misses correctly",
        f" * and `next.config.ts` may serve {deck.url}/* as `immutable`.",
        " *",
        " * Plain data. No `import 'server-only'` — the shelf is a plain component and this",
        " * holds no secret.",
        " */",
        f"import type {{ {deck.key_type} }} from './types'",
        "",
        f"export interface {deck.art_type} {{",
        f"  /** {PANEL_W}×{PANEL_H} WebP for a badge panel — the master's own 4:3. */",
        "  src: string",
        *small_doc,
        "  small: string",
        f"  /** SHA-256 of `{deck.masters}/<key>.png`, the approved master. */",
        "  sha256: string",
        *twill_doc,
        "  twill: string",
        "  /** The style.md version this image was generated against. */",
        "  styleVersion: string",
        "}",
        "",
        "/** Intrinsic pixel sizes, so a consumer never has to restate them. */",
        f"export const {deck.const_name}_WIDTH = {PANEL_W}",
        f"export const {deck.const_name}_HEIGHT = {PANEL_H}",
        f"export const {deck.const_name}_SMALL_SIZE = {SMALL}",
        "",
        f"export const {deck.const_name}: Record<{deck.key_type}, {deck.art_type}> = {{",
    ]
    for key, sha, twill in entries:
        h8 = sha[:8]
        lines += [
            f"  {key}: {{",
            f"    src: '{deck.url}/{key}.{h8}.webp',",
            f"    small: '{deck.url}/{key}.{h8}.sm.webp',",
            f"    sha256: '{sha}',",
            f"    twill: '{twill}',",
            f"    styleVersion: '{style_versions.get(key) or 'unknown'}',",
            "  },",
        ]
    lines += ["}", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Promote approved masters and regenerate a deck's manifest."
    )
    add_deck_argument(parser)
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change; write nothing")
    parser.add_argument("--lossless", action="store_true",
                        help="lossless WebP, if the merrowed border rings at 220 px")
    args = parser.parse_args()

    deck = deck_for(args.deck)
    MASTERS = deck.masters_dir()
    PUBLIC = deck.public_dir()
    MANIFEST = deck.manifest_path()

    keys = deck_keys(deck)
    missing = [k for k in keys if not (MASTERS / f"{k}.png").exists()]
    if missing:
        print(f"error: {len(missing)} of {len(keys)} masters are missing from "
              f"{deck.masters}/:", file=sys.stderr)
        for k in missing:
            print(f"  {k}.png", file=sys.stderr)
        print(f"\nNothing was written. The manifest is a TOTAL Record and a partial\n"
              f"one would not compile — refusing is what keeps the build green while\n"
              f"the deck is still being generated. Generate and promote the rest:\n"
              f"  python3 tools/gen_badge_art.py <key> --deck {deck.name}\n"
              f"  cp {deck.masters}/_candidates/<key>.aNN.png {deck.masters}/<key>.png\n"
              f"  cp {deck.masters}/_candidates/<key>.aNN.txt {deck.masters}/<key>.txt",
              file=sys.stderr)
        sys.exit(1)

    PUBLIC.mkdir(parents=True, exist_ok=True)
    entries = []
    versions = {}
    expected = set()

    for key in keys:
        master = MASTERS / f"{key}.png"
        sha = hashlib.sha256(master.read_bytes()).hexdigest()
        h8 = sha[:8]
        versions[key] = style_version_for(deck, key)
        if versions[key] is None:
            print(f"warning: {key} has no {deck.masters}/{key}.txt sidecar; its style "
                  f"version will be recorded as \"unknown\". Copy the candidate's .txt "
                  f"when you promote.", file=sys.stderr)

        img = Image.open(master).convert("RGB")
        if img.size != (MASTER_W, MASTER_H):
            sys.exit(f"error: {master} is {img.size[0]}×{img.size[1]}, "
                     f"want {MASTER_W}×{MASTER_H}")

        # Sampled here, off the master already in memory, so the file is read
        # once and both fields of the entry describe the same bytes.
        entries.append((key, sha, twill_hex(img)))

        # The shelf mark's square comes from a CROP of the master, not from a
        # resize of it — see the header. Taken before either derivative is
        # written so the crop is of the master's own pixels, never of the
        # already-downsampled panel.
        square = img.crop(((MASTER_W - MASTER_H) // 2, 0,
                           (MASTER_W + MASTER_H) // 2, MASTER_H))

        for src, (ow, oh), suffix in (
            (img, (PANEL_W, PANEL_H), "webp"),
            (square, (SMALL, SMALL), "sm.webp"),
        ):
            out = PUBLIC / f"{key}.{h8}.{suffix}"
            expected.add(out.name)
            if args.dry_run:
                print(f"would write {out.relative_to(ROOT)}  ({ow}×{oh})")
                continue
            opts = {"lossless": True} if args.lossless else {"quality": QUALITY}
            src.resize((ow, oh), Image.LANCZOS).save(out, "WEBP", method=METHOD, **opts)
            print(f"{out.relative_to(ROOT)}  {ow}×{oh}  "
                  f"{out.stat().st_size / 1024:.0f} kB")

    # Orphans: a stale hash left behind by a regeneration. Only files matching the
    # generated shape for a known key are removed; anything else is reported and
    # left alone, because this tool should not be the thing that deletes a file a
    # human put there deliberately.
    shape = re.compile(rf"^({'|'.join(map(re.escape, keys))})\.[0-9a-f]{{8}}\.(sm\.)?webp$")
    if PUBLIC.exists():
        for path in sorted(PUBLIC.iterdir()):
            if path.name in expected or path.is_dir():
                continue
            if shape.match(path.name):
                print(f"{'would remove' if args.dry_run else 'removed'} stale "
                      f"{path.relative_to(ROOT)}")
                if not args.dry_run:
                    path.unlink()
            else:
                print(f"warning: unrecognised file left alone: {path.relative_to(ROOT)}",
                      file=sys.stderr)

    text = emit_manifest(deck, entries, versions)
    if args.dry_run:
        print(f"\nwould write {MANIFEST.relative_to(ROOT)} "
              f"({len(entries)} entries, {len(text.splitlines())} lines)")
    else:
        MANIFEST.write_text(text, encoding="utf-8")
        print(f"\nwrote {MANIFEST.relative_to(ROOT)}  ({len(entries)} entries)")

    mixed = sorted({v for v in versions.values() if v})
    if len(mixed) > 1:
        print(f"\nwarning: MIXED STYLE VERSIONS across the deck: {', '.join(mixed)}. "
              f"`npm run badges:check` treats this as a failure, not a surprise.",
              file=sys.stderr)

    print("\nnext: npm run badges:check && npm run typecheck")


if __name__ == "__main__":
    main()
