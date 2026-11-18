# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Build a specimen deck that shows a brand: every layout from the framework's own examples, a few
slides on each non-default surface, and the chart and number components.

Usage:
  python3 make_specimen.py <brand> [--deck <name>] [--replace] [--map-out <file>]

Run it from the workspace folder (the one with decks/ and brands/), after `deck brand check <brand>`
passes. It uses only the installed `deck` command: `deck new`, `deck layouts --json` and `deck new slide`. The deck is called `zz-<brand>-specimen` by default (the
`zz-` prefix marks a scratch deck: it stays out of `deck build --out` sites). Then:

  deck lint <deck>               what the brand's sizes and spacing break
  deck shot <deck>               a PNG per slide in .deck/shots/<deck>/

A brand that came from a template (brands/<brand>/layouts.ts) gets one slide per brand layout, first, named
`brand-<layout>`; a layout with art for a second surface (a light and a dark master) gets another slide on that
surface. `--map-out` writes which slide shows which layout (and which source layout it is compared with), for
compare.py --layouts. `DECK_CMD` replaces the `deck` command (for example `pnpm deck` in a framework checkout).

The content is the framework's own example text, so it differs from the source's; judge treatment,
not wording. Lint may warn about repeated layouts and the layout slides' topic-style titles:
that is the specimen's shape, not the brand. Delete decks/<deck>/ when the import is done.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

SURFACES = ("inverse", "accent", "gradient")
# Whole-slide figures on the `chart` layout: (slide id, title, MDX). Inline data, because the
# catalog examples name data variables that a slide does not have.
FIGURES = (
    ("figure-big-number", "Replies now arrive in 2.5 hours, down from 14",
     '<BigNumber value={2.5} unit="h" label="median first reply" from={14} better="down" relative={false} />'),
    ("figure-stat-row", "Three numbers sit side by side without losing their order",
     "<StatRow stats={[{ value: 38, unit: '%', label: 'fewer tickets', highlight: true },"
     " { value: 2.5, unit: 'h', label: 'first reply', from: 14, better: 'down' }, { value: 94, unit: '%', label: 'satisfaction' }]} />"),
    ("figure-line-chart", "Tickets fell after the June redesign shipped",
     "<LineChart data={[{ month: 'Apr', '2025': 120, '2026': 118 }, { month: 'May', '2025': 126, '2026': 110 },"
     " { month: 'Jun', '2025': 131, '2026': 96 }, { month: 'Jul', '2025': 128, '2026': 74 }, { month: 'Aug', '2025': 133, '2026': 61 }]}"
     " x=\"month\" y={['2025', '2026']} highlight=\"2026\" caption=\"Tickets per month\" />"),
    ("figure-donut", "Chat now carries half of all conversations",
     "<Donut data={[{ channel: 'Chat', n: 52 }, { channel: 'Email', n: 31 }, { channel: 'Phone', n: 17 }]}"
     " x=\"channel\" y=\"n\" highlight=\"Chat\" centerLabel=\"on chat\" caption=\"Share of conversations\" />"),
    ("figure-table", "The Team plan costs less per seat than Solo",
     "<Table data={[{ plan: 'Solo', cost: 12 }, { plan: 'Team', cost: 9 }, { plan: 'Scale', cost: 7 }]}"
     " columns={['plan', { key: 'cost', format: 'currency', bar: true }]} highlight={{ row: 'Team' }} caption=\"Per seat per month\" />"),
    ("figure-heatmap", "Monday mornings carry the heaviest load",
     "<Heatmap data={[{ day: 'Mon', hour: '9-12', tickets: 90 }, { day: 'Mon', hour: '13-17', tickets: 60 },"
     " { day: 'Tue', hour: '9-12', tickets: 50 }, { day: 'Tue', hour: '13-17', tickets: 35 }]}"
     " x=\"hour\" y=\"day\" value=\"tickets\" highlight={{ x: '9-12', y: 'Mon' }} caption=\"Tickets per half day\" />"),
)


def deck_command() -> list[str]:
    return shlex.split(os.environ.get("DECK_CMD") or "deck")


def deck(*args: str) -> str:
    run = subprocess.run([*deck_command(), *args], capture_output=True, text=True)
    if run.returncode != 0:
        out = run.stdout + run.stderr
        hint = "\nThe deck is a workspace package: run `npm install` (or `pnpm install`) in the workspace so it is linked, then run this again with --replace." if "Cannot find package" in out else ""
        sys.exit(f"`deck {' '.join(args)}` failed:\n{out}{hint}")
    return run.stdout


def deck_json(*args: str) -> dict:
    out = deck(*args, "--json")
    start = out.index("\n{") + 1 if "\n{" in out else out.index("{")
    return json.loads(out[start:])


def kebab(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("brand")
    ap.add_argument("--deck", help="deck folder name (default zz-<brand>-specimen)")
    ap.add_argument("--replace", action="store_true", help="delete and rebuild the deck if it exists")
    ap.add_argument("--map-out", help="write which slide shows which brand layout to this JSON file")
    args = ap.parse_args()
    if shutil.which(deck_command()[0]) is None:
        sys.exit("`deck` is not on PATH. Install it with: npm install --global @deckster/cli (Node 26 or newer).")
    name = args.deck or f"zz-{kebab(args.brand)}-specimen"
    folder = Path("decks") / name
    if folder.exists():
        if not args.replace:
            sys.exit(f"{folder} already exists. Pass --replace to rebuild it.")
        shutil.rmtree(folder)

    ap_map = args.map_out
    deck("new", name, "--brand", args.brand, "--title", f"{args.brand} specimen")
    layouts = deck_json("layouts", name)["layouts"]
    added: list[str] = []
    mapping: list[dict] = []
    own = [lay for lay in layouts if str(lay.get("source", "")) == f"brand:{args.brand}"]
    notes_file = Path("brands") / args.brand / "import-notes.json"
    imported = {}
    if notes_file.is_file():
        for entry in (json.loads(notes_file.read_text(encoding="utf-8")).get("layouts") or []):
            if isinstance(entry, dict) and entry.get("name"):
                imported[entry["name"]] = entry

    def add_slide(slide_id: str, layout: str) -> Path:
        deck("new", "slide", name, slide_id, "--layout", layout)
        added.append(slide_id)
        return folder / "slides" / f"{slide_id}.mdx"

    for lay in own:
        entry = imported.get(lay["name"], {})
        slide_id = f"brand-{lay['name']}"
        add_slide(slide_id, lay["name"])
        mapping.append({"layout": lay["name"], "surface": None, "slide": slide_id, "keys": entry.get("keys") or [], "sources": entry.get("sources") or [], "surface_default": entry.get("surface")})
        for art in entry.get("art") or []:
            m = re.match(rf"layouts/{re.escape(lay['name'])}-([a-z0-9-]+?)(?:-\d+)?\.\w+$", art)
            surface = m.group(1) if m else None
            if surface and surface != entry.get("surface"):
                other = f"{slide_id}-{surface}"
                path = add_slide(other, lay["name"])
                path.write_text(path.read_text().replace(f"layout: {lay['name']}\n", f"layout: {lay['name']}\nsurface: {surface}\n", 1))
                mapping.append({"layout": lay["name"], "surface": surface, "slide": other, "keys": entry.get("keys") or [], "sources": entry.get("sources") or [], "surface_default": entry.get("surface")})
    for layout in layouts:
        if layout["name"] != "title" and layout not in own:  # `deck new` already wrote the cover
            add_slide(f"layout-{layout['name']}", layout["name"])
    for surface in SURFACES:
        path = add_slide(f"content-{surface}", "content")
        path.write_text(path.read_text().replace("layout: content\n", f"layout: content\nsurface: {surface}\n", 1))

    for slide_id, title, body in FIGURES:
        path = add_slide(slide_id, "chart")
        path.write_text(f"---\nlayout: chart\ntitle: {title}\n---\n\n{body}\n\n<Notes>Specimen.</Notes>\n")

    if ap_map:
        Path(ap_map).write_text(json.dumps({"deck": name, "brand": args.brand, "slides": mapping}, indent=2) + "\n", encoding="utf-8")
        print("wrote", ap_map)
    print(f"Built {folder} with {len(added) + 1} slides ({len(mapping)} on the brand's own layouts).")
    print(f"Next: deck lint {name}; deck shot {name}")


if __name__ == "__main__":
    main()
