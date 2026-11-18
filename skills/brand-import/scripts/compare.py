# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10"]
# ///
"""Put source pages next to the brand's rendered slides, one image per pair, to look at.

Usage:
  uv run compare.py --out <dir> <source.png>:<specimen.png> [<source.png>:<specimen.png> ...]
  uv run compare.py --out <dir> --sheet <dir of PNGs>          (a contact sheet of one folder)
  uv run compare.py --out <dir> --layouts <specimen-map.json> --extraction <dir of extraction.json> --shots <dir of deck shot PNGs>
      each brand layout's specimen slide next to the filled reference render of its source layout
      (<extraction>/layouts/ref-<key>.png); a layout drawn on two surfaces is compared once per surface

The specimen side is a screenshot from `deck shot <deck>` of the specimen deck that
make_specimen.py builds (or any deck rendered with `--brand <name>`). Pair each kind of
source page with the closest slide: cover with cover, section with section, a chart with a
chart. Then open the written images and compare colour, type, density, accent use and shape.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

HEIGHT = 720


def pair_sheet(source: Path, specimen: Path, dest: Path) -> None:
    left, right = Image.open(source).convert("RGB"), Image.open(specimen).convert("RGB")
    left = left.resize((round(left.width * HEIGHT / left.height), HEIGHT))
    right = right.resize((round(right.width * HEIGHT / right.height), HEIGHT))
    sheet = Image.new("RGB", (left.width + right.width + 36, HEIGHT + 52), (238, 238, 238))
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), f"SOURCE  {source.name}", fill=(20, 20, 20))
    draw.text((left.width + 24, 8), f"BRAND  {specimen.name}", fill=(20, 20, 20))
    sheet.paste(left, (12, 32))
    sheet.paste(right, (left.width + 24, 32))
    sheet.save(dest)


def contact_sheet(folder: Path, dest: Path, cols: int = 4, width: int = 480) -> None:
    files = sorted(p for p in folder.glob("*.png") if ".step" not in p.name)
    if not files:
        raise SystemExit(f"No PNGs in {folder}")
    thumbs = []
    for f in files:
        im = Image.open(f).convert("RGB")
        thumbs.append((f.name, im.resize((width, round(im.height * width / im.width)))))
    height = max(t.height for _, t in thumbs) + 22
    rows = -(-len(thumbs) // cols)
    sheet = Image.new("RGB", (cols * (width + 8) + 8, rows * (height + 8) + 8), (238, 238, 238))
    draw = ImageDraw.Draw(sheet)
    for i, (name, thumb) in enumerate(thumbs):
        x, y = 8 + (i % cols) * (width + 8), 8 + (i // cols) * (height + 8)
        draw.text((x, y), name, fill=(20, 20, 20))
        sheet.paste(thumb, (x, y + 18))
    sheet.save(dest)


def compare_layouts(map_file: Path, extraction: Path, shots: Path, out: Path) -> list[Path]:
    """One side-by-side image per specimen slide of a brand layout: the source layout's filled reference render on
    the left, the framework's render of the layout on the right."""
    mapping = json.loads(map_file.read_text(encoding="utf-8"))["slides"]
    written: list[Path] = []
    for entry in mapping:
        surface = entry.get("surface") or entry.get("surface_default")
        sources = entry.get("sources") or [{"key": k, "surface": None} for k in entry.get("keys", [])]
        pick = next((s for s in sources if s.get("surface") == surface), sources[0] if sources else None)
        if pick is None:
            print(f"skipped {entry['layout']}: no source layout recorded")
            continue
        ref = extraction / "layouts" / f"ref-{pick['key'].replace('/', '-')}.png"
        shot = next((p for p in sorted(shots.glob("*.png")) if re.fullmatch(rf"\d+-{re.escape(entry['slide'])}\.png", p.name)), None)
        if not ref.is_file() or shot is None:
            print(f"skipped {entry['layout']}: {'no reference render ' + str(ref.name) if not ref.is_file() else 'no specimen shot for ' + entry['slide']}")
            continue
        dest = out / f"layout-{entry['layout']}{'-' + entry['surface'] if entry.get('surface') else ''}.png"
        pair_sheet(ref, shot, dest)
        written.append(dest)
        print("wrote", dest)
    if written:
        contact_sheet_of(written, out / "layouts-sheet.png")
    return written


def contact_sheet_of(files: list[Path], dest: Path, cols: int = 2, width: int = 900) -> None:
    thumbs = [Image.open(f).convert("RGB") for f in files]
    thumbs = [t.resize((width, round(t.height * width / t.width))) for t in thumbs]
    rows = -(-len(thumbs) // cols)
    height = max(t.height for t in thumbs)
    sheet = Image.new("RGB", (cols * (width + 8) + 8, rows * (height + 8) + 8), (238, 238, 238))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (8 + (i % cols) * (width + 8), 8 + (i // cols) * (height + 8)))
    sheet.save(dest)
    print("wrote", dest)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pairs", nargs="*", help="source.png:specimen.png")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--sheet", type=Path, help="write a contact sheet of this folder's PNGs instead")
    ap.add_argument("--layouts", type=Path, help="specimen-map.json from make_specimen.py --map-out: compare the brand's layouts with the source's")
    ap.add_argument("--extraction", type=Path, help="with --layouts: the folder of the template's extraction.json")
    ap.add_argument("--shots", type=Path, help="with --layouts: the folder of `deck shot` PNGs of the specimen")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    if args.layouts:
        if not (args.extraction and args.shots):
            ap.error("--layouts needs --extraction and --shots")
        if not compare_layouts(args.layouts, args.extraction, args.shots, args.out):
            raise SystemExit("nothing to compare")
        return
    if args.sheet:
        dest = args.out / f"sheet-{args.sheet.name.replace('@', '-')}.png"
        contact_sheet(args.sheet, dest)
        print("wrote", dest)
        return
    if not args.pairs:
        ap.error("give at least one source.png:specimen.png pair, or --sheet <dir>")
    for old in args.out.glob("compare-[0-9][0-9]*.png"):
        old.unlink()  # a rerun with a different pair list must not leave stale images behind
    for n, pair in enumerate(args.pairs, 1):
        source, _, specimen = pair.partition(":")
        dest = args.out / f"compare-{n:02d}-{Path(specimen).stem}.png"
        pair_sheet(Path(source), Path(specimen), dest)
        print("wrote", dest)


if __name__ == "__main__":
    main()
