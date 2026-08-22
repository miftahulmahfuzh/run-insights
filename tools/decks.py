#!/usr/bin/env python3
"""The two patch decks, as one table — and the JSON the JS guard reads.

    python3 tools/decks.py            # print the table
    python3 tools/decks.py --write    # regenerate tools/decks.json
    python3 tools/decks.py --selftest # offline, no network, no key

Design record: docs/plans/F25-record-patch-art.md §5.

WHY THIS FILE EXISTS AT ALL. `make_badge_assets.py`'s header asked for it by
name:

    ONE DECK. The tool this descends from carries a `DECKS` table because
    daily-words ships badge medals AND level panels; Run Insights has only the
    badge shelf, so the table is four module constants. If a second deck ever
    appears, restore the abstraction then.

F25 is that second deck — ten personal-record patches. So the abstraction is
restored, and it is restored as ONE table rather than as four private ones, for
the reason the four private ones would have been wrong: `gen_badge_art.py`,
`check_badge_art.py`, `make_badge_assets.py` and `scripts/check-badge-art.mjs`
all need the same answer to "where do this deck's masters live", and four copies
of that answer is four chances to disagree with no check in between.

`--deck` DEFAULTS TO `badges` EVERYWHERE. Every command written down in the
badge deck's docs, plan and skill keeps working exactly as typed. A second deck
must not make the first deck's instructions wrong.

ONE ANCHOR, SHARED. `records` deliberately points at `assets/badges/_anchor.png`
rather than growing an anchor of its own. Check 9b measures twill-tone drift
against the anchor, and the premise of both decks is that they are one bolt of
cloth cut thirty-two times. Two anchors would let the cloth drift BETWEEN decks
with nothing measuring it — the one drift that no per-deck check could see.

WHY THE STYLE VERSION IS COMPOSITE. `scripts/check-badge-art.mjs` asserts that
every promoted master's sidecar version equals style.md's current version, so
bumping `STYLE BLOCK v2` to v3 fails `npm run badges:check` on all 22 badges
until every one of them is regenerated. The records deck therefore does NOT edit
the shared block. It appends an ADDENDUM region read only for its own
generations, and stamps `v2+records1` — `<block version>+<deck><addendum
version>`. The badge deck stamps a bare `v2`, unchanged on disk.

WHY THERE IS A JSON SIDECAR. `scripts/check-badge-art.mjs` is JavaScript and
cannot import this module. The alternative is a hand-copied second table in the
`.mjs`, which is exactly the drift this file exists to prevent — so the table is
serialised here and read there, and `--selftest` fails if the JSON on disk no
longer matches the Python. Regenerate with `--write` after any edit.

stdlib only, like every tool in this directory except the checker (which needs
PIL). This one does not even need that.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = Path(__file__).resolve().parent / "decks.json"


@dataclass(frozen=True)
class Deck:
    """One deck of patches: where its scenes, keys, masters and manifest live.

    Every path is repo-relative text, not a `Path`, because this dataclass is
    serialised to JSON for the JS guard and a `Path` would not survive the trip.
    Consumers join against `ROOT` themselves — `deck.masters_dir()` and friends
    below do it in one place.
    """

    #: `--deck <name>`.
    name: str
    #: The `<!-- ... -->` marker pair in style.md holding this deck's scene lines.
    scenes_marker: str
    #: A second marker pair appended to the shared style block for this deck
    #: only, or None for the deck the block was written for.
    addendum_marker: str | None
    #: What `write_sidecar` stamps and `check-badge-art.mjs` asserts against.
    #: `None` means "the style block's own version, bare".
    addendum_version: str | None
    #: The TypeScript module holding the key list, and how to read it.
    catalog: str
    catalog_array: str
    #: A regex with ONE group, matched with re.M against the array literal's body.
    key_pattern: str
    #: Approved masters (`<key>.png` + `<key>.txt`), and candidates beneath them.
    masters: str
    #: Shipped derivatives, content-hashed.
    public: str
    #: The URL prefix those derivatives are served from. Must have a matching
    #: `immutable` entry in next.config.ts — the hash in the filename is what
    #: licenses it.
    url: str
    #: The generated manifest, its exported const, and the key type it is total over.
    manifest: str
    const_name: str
    key_type: str
    art_type: str
    #: The noun `gen_badge_art.py` labels the scene line with in the prompt.
    subject_label: str
    #: Check 9's baseline. Shared — see the header.
    anchor: str
    #: Human-readable, for error messages and the manifest's docblock.
    noun: str

    # -- joins, so no caller repeats `ROOT / ...` ---------------------------- #

    def masters_dir(self) -> Path:
        return ROOT / self.masters

    def candidates_dir(self) -> Path:
        return self.masters_dir() / "_candidates"

    def public_dir(self) -> Path:
        return ROOT / self.public

    def manifest_path(self) -> Path:
        return ROOT / self.manifest

    def catalog_path(self) -> Path:
        return ROOT / self.catalog

    def anchor_path(self) -> Path:
        return ROOT / self.anchor

    def style_version(self, block_version: str) -> str:
        """`v2` for badges, `v2+records1` for records.

        Composite rather than a bump, because a bump would invalidate 22
        promoted masters — see the header.
        """
        if not self.addendum_version:
            return block_version
        return f"{block_version}+{self.name}{self.addendum_version}"


DECKS: dict[str, Deck] = {
    "badges": Deck(
        name="badges",
        scenes_marker="SCENES",
        addendum_marker=None,
        addendum_version=None,
        catalog="lib/badges/catalog.ts",
        catalog_array="BADGE_CATALOG",
        # F09 ships the catalog as a `readonly BadgeDefinition[]` built by a
        # `badge(key, title, scope)` helper, so the key is the helper's first
        # argument. Single quotes because that is what Prettier writes here.
        key_pattern=r"^\s*badge\(\s*'([a-z0-9_]+)'",
        masters="assets/badges",
        public="public/badges",
        url="/badges",
        manifest="lib/badges/badge-art.ts",
        const_name="BADGE_ART",
        key_type="BadgeKey",
        art_type="BadgeArt",
        subject_label="SUBJECT FOR THIS BADGE",
        anchor="assets/badges/_anchor.png",
        noun="badge",
    ),
    "records": Deck(
        name="records",
        scenes_marker="SCENES:records",
        addendum_marker="ADDENDUM:records",
        addendum_version="1",
        catalog="lib/records/catalog.ts",
        catalog_array="RECORD_CATALOG",
        # F06 ships this one as plain object literals — `{ key: 'longest_distance',
        # unit: 'm', ... }` — so the shape differs from the badge catalog's and
        # the pattern is per-deck rather than shared. This is precisely the
        # difference a single hardcoded KEY_RE could not have expressed.
        key_pattern=r"^\s*key:\s*'([a-z0-9_]+)'",
        masters="assets/records",
        public="public/records",
        url="/records",
        manifest="lib/records/record-art.ts",
        const_name="RECORD_ART",
        key_type="RecordKey",
        art_type="RecordArt",
        subject_label="SUBJECT FOR THIS PATCH",
        anchor="assets/badges/_anchor.png",
        noun="record patch",
    ),
}

DEFAULT_DECK = "badges"


def deck_for(name: str | None) -> Deck:
    """Resolve `--deck`, defaulting to the deck every existing doc assumes."""
    key = name or DEFAULT_DECK
    if key not in DECKS:
        sys.exit(
            f"error: unknown deck {key!r}. Known decks: {', '.join(sorted(DECKS))}\n"
            f"  A deck is added in tools/decks.py, and `python3 tools/decks.py --write`\n"
            f"  regenerates tools/decks.json for scripts/check-badge-art.mjs."
        )
    return DECKS[key]


def add_deck_argument(parser) -> None:
    """The one place `--deck`'s help text is written."""
    parser.add_argument(
        "--deck",
        default=DEFAULT_DECK,
        choices=sorted(DECKS),
        help=f"which patch deck (default {DEFAULT_DECK})",
    )


# --------------------------------------------------------------------------- #
# The JSON sidecar
# --------------------------------------------------------------------------- #

def as_json() -> str:
    payload = {
        "_generated": "python3 tools/decks.py --write — do not edit by hand",
        "default": DEFAULT_DECK,
        "decks": {name: asdict(deck) for name, deck in DECKS.items()},
    }
    return json.dumps(payload, indent=2) + "\n"


def write_json() -> bool:
    text = as_json()
    if JSON_PATH.exists() and JSON_PATH.read_text(encoding="utf-8") == text:
        return False
    JSON_PATH.write_text(text, encoding="utf-8")
    return True


# --------------------------------------------------------------------------- #

def selftest() -> int:
    """Offline. No network, no API key, no PIL, no repo state beyond this file."""
    failures = []

    def check(label, condition, detail=""):
        if condition:
            print(f"  ok   {label}")
        else:
            failures.append(label)
            print(f"  FAIL {label}{chr(10) + '         ' + detail if detail else ''}")

    print("decks.py selftest")

    check("the default deck exists", DEFAULT_DECK in DECKS)
    check("deck_for(None) is the default", deck_for(None).name == DEFAULT_DECK)

    # Every deck must own its own storage. Two decks sharing a masters dir, a
    # public dir or a manifest would overwrite each other silently.
    for field in ("scenes_marker", "masters", "public", "url", "manifest",
                  "const_name", "key_type", "art_type", "catalog"):
        values = [getattr(d, field) for d in DECKS.values()]
        check(f"{field} is unique across decks", len(values) == len(set(values)),
              f"duplicated: {values}")

    # The anchor is the deliberate exception, and it is asserted rather than
    # merely allowed — if a future deck grows its own anchor, this line is where
    # the header's argument gets re-read.
    anchors = {d.anchor for d in DECKS.values()}
    check("all decks share one anchor", len(anchors) == 1, f"got {anchors}")

    check("badges stamps a bare block version",
          DECKS["badges"].style_version("v2") == "v2")
    check("records stamps a composite version",
          DECKS["records"].style_version("v2") == "v2+records1",
          f"got {DECKS['records'].style_version('v2')}")

    # The key pattern is per-deck because the two catalogs have different
    # shapes; a pattern with no capture group would return the whole match and
    # silently produce nonsense keys.
    import re
    for deck in DECKS.values():
        try:
            compiled = re.compile(deck.key_pattern, re.M)
        except re.error as exc:
            check(f"{deck.name} key_pattern compiles", False, str(exc))
            continue
        check(f"{deck.name} key_pattern compiles", True)
        check(f"{deck.name} key_pattern has exactly one group",
              compiled.groups == 1, f"has {compiled.groups}")

    # The whole reason the JSON exists: the JS guard reads it, and a stale copy
    # is a table that disagrees with itself.
    on_disk = JSON_PATH.read_text(encoding="utf-8") if JSON_PATH.exists() else None
    check("tools/decks.json is in step with this file", on_disk == as_json(),
          "run `python3 tools/decks.py --write`")

    print(f"\n{'FAILED: ' + ', '.join(failures) if failures else 'all checks passed'}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="The patch decks, as one table.")
    parser.add_argument("--write", action="store_true",
                        help="regenerate tools/decks.json for the JS guard")
    parser.add_argument("--selftest", action="store_true",
                        help="offline consistency checks")
    args = parser.parse_args()

    if args.selftest:
        return selftest()

    if args.write:
        changed = write_json()
        print(f"{'wrote' if changed else 'unchanged'} {JSON_PATH.relative_to(ROOT)}")
        return 0

    for name, deck in DECKS.items():
        mark = "  (default)" if name == DEFAULT_DECK else ""
        print(f"\n{name}{mark}")
        print(f"  scenes      <!-- {deck.scenes_marker} -->")
        if deck.addendum_marker:
            print(f"  addendum    <!-- {deck.addendum_marker} v{deck.addendum_version} -->")
        print(f"  catalog     {deck.catalog}  ({deck.catalog_array})")
        print(f"  masters     {deck.masters}")
        print(f"  public      {deck.public}  → {deck.url}")
        print(f"  manifest    {deck.manifest}  ({deck.const_name}: Record<{deck.key_type}, {deck.art_type}>)")
        print(f"  anchor      {deck.anchor}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
