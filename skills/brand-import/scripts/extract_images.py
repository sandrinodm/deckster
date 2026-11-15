# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10", "numpy>=1.26"]
# ///
"""Extract brand evidence from screenshots, photos of slides or exported page images.

Usage:
  uv run extract_images.py <image-or-folder> [...] --out <dir>

Images give colours, backgrounds and gradients. They do not give font names,
exact sizes, or anything declared. The typefaces, the type scale and the layout
structure have to be read off the images by eye; this script only prepares them
(normalised copies, a contact sheet) and measures what pixels can tell.

Also accepts an SVG logo or brand-guideline PDF pages already rendered to PNG.

Writes:
  <out>/extraction.json
  <out>/pages/page-NNN.png, <out>/pages/contact-sheet.png
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _common as C  # noqa: E402

EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-width", type=int, default=1920)
    args = ap.parse_args()

    from PIL import Image  # noqa: PLC0415

    files: list[Path] = []
    for p in args.inputs:
        if p.is_dir():
            files += sorted(f for f in p.iterdir() if f.suffix.lower() in EXT)
        elif p.suffix.lower() in EXT:
            files.append(p)
    if not files:
        sys.exit("No raster images found. For SVG, read the file directly: fills and strokes are in the markup.")

    out = args.out
    (out / "pages").mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    pages, images = [], []
    uses: dict[str, dict] = defaultdict(lambda: {"area": 0.0, "background": 0.0, "pages": set()})
    grads: dict[tuple, dict] = {}
    for i, f in enumerate(files, 1):
        im = Image.open(f)
        lossy = f.suffix.lower() in (".jpg", ".jpeg", ".webp")
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA")
        if im.width > args.max_width:
            im = im.resize((args.max_width, round(im.height * args.max_width / im.width)), Image.LANCZOS)
        dest = out / "pages" / f"page-{i:03d}.png"
        im.save(dest)
        images.append(dest)
        pal = C.image_palette(dest, 10, threshold=4.0 if lossy else 2.0)
        bg = C.analyze_background(dest)
        if bg["kind"] == "gradient":
            # Pixels along a gradient are not brand colours: drop palette entries that sit on the line between its stops.
            ends = [C.hex_to_rgb(s["hex"]) for s in (bg["stops"][0], bg["stops"][-1])]

            def on_ramp(hexv: str) -> bool:
                px = C.hex_to_rgb(hexv)
                ab = [b - a_ for a_, b in zip(*ends)]
                ap_ = [p_ - a_ for a_, p_ in zip(ends[0], px)]
                tt = max(0.0, min(1.0, sum(x * y for x, y in zip(ab, ap_)) / (sum(x * x for x in ab) or 1)))
                near = [a_ + tt * d for a_, d in zip(ends[0], ab)]
                return sum((x - y) ** 2 for x, y in zip(px, near)) ** 0.5 < 22

            pal = [c for c in pal if not on_ramp(c["hex"])]
        for c in pal:
            uses[c["hex"]]["area"] += c["share"]
            uses[c["hex"]]["pages"].add(i)
        if bg["kind"] == "solid":
            uses[bg["hex"]]["background"] += 1
        elif bg["kind"] == "gradient":
            key = (bg["css_angle_deg"], tuple(s["hex"] for s in bg["stops"]))
            grads.setdefault(key, {**{k: v for k, v in bg.items() if k != "kind"}, "pages": []})["pages"].append(i)
        pages.append({"index": i, "image": str(dest.relative_to(out)), "source_file": str(f), "size": list(im.size), "aspect": round(im.width / im.height, 3),
                      "lossy_source": lossy, "background": bg, "palette": pal, "layout_hints": []})
    if any(p["lossy_source"] for p in pages):
        warnings.append("Some inputs are JPEG/WebP: colours are approximate (compression shifts them by a few units). Prefer hexes that recur across images, and ask for brand values if exactness matters.")
    warnings.append("Images carry no font names and no declared values. Identify typefaces by eye, record them as low-confidence guesses, and put them on the human review list.")

    # The same gradient often reappears inside panels on pages whose own background is flat:
    # remove in-between ramp colours everywhere, keeping the stops themselves.
    for g in grads.values():
        e0, e1 = C.hex_to_rgb(g["stops"][0]["hex"]), C.hex_to_rgb(g["stops"][-1]["hex"])
        ab = [b - a_ for a_, b in zip(e0, e1)]
        for hexv in list(uses):
            px = C.hex_to_rgb(hexv)
            tt = sum(x * (p_ - a_) for x, a_, p_ in zip(ab, e0, px)) / (sum(x * x for x in ab) or 1)
            near = [a_ + max(0.0, min(1.0, tt)) * d for a_, d in zip(e0, ab)]
            dist = sum((x - y) ** 2 for x, y in zip(px, near)) ** 0.5
            if dist < 22 and 0.06 < tt < 0.94 and not uses[hexv]["background"]:
                del uses[hexv]
    # Off-white paper and pure white cards are about 2.7 apart: merge tightly unless compression noise forces otherwise.
    merged = C.cluster_colors({h: u["area"] for h, u in uses.items()}, 3.5 if any(p["lossy_source"] for p in pages) else 2.0)
    n = len(pages)
    observed = []
    for c in merged[:40]:
        pg = sorted(set().union(*(uses[m]["pages"] for m in c["members"])))
        observed.append({"hex": c["hex"], "weight": round(c["weight"] / n, 4), "page_share": round(len(pg) / n, 2),
                         "uses": {"area": round(c["weight"] / n, 4), **({"background": sum(uses[m]["background"] for m in c["members"])} if any(uses[m]["background"] for m in c["members"]) else {})},
                         "pages": pg, "variants_merged": len(c["members"])})
    C.contact_sheet(images, out / "pages/contact-sheet.png", cols=min(4, max(1, n)))
    data = {
        "source": {"type": "images", "path": ", ".join(str(f) for f in files[:6]), "page_count": n,
                   "canvas_scale": {"note": "No physical sizes. Estimate type sizes as a fraction of image height, then multiply by 1080."}},
        "tool": {"script": "extract_images.py"},
        "declared": {"colors": [], "fonts": []},
        "observed": {"colors": observed, "fonts": [], "text_styles": [], "gradients": list(grads.values()), "shapes": {}},
        "pages": pages,
        "layouts": [],
        "assets": {"images": [], "contact_sheet": "pages/contact-sheet.png"},
        "dataviz": {"charts": [], "tables": [], "big_numbers": [], "note": "Not detected from pixels. Look at the images: record chart colours from each page's palette."},
        "warnings": warnings,
    }
    path = C.write_extraction(out, data)
    print(C.summarize(data))
    print("wrote", path)


if __name__ == "__main__":
    main()
