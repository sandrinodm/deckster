# /// script
# requires-python = ">=3.10"
# dependencies = ["pymupdf>=1.24", "pillow>=10", "numpy>=1.26", "fonttools>=4.50"]
# ///
"""Extract brand evidence from a PDF into extraction.json plus assets.

Usage:
  uv run extract_pdf.py <file.pdf> --out <dir> [--max-pages 60] [--render-width 1920] [--dump-fonts]

Writes:
  <out>/extraction.json           neutral extraction (see references/extraction-format.md)
  <out>/pages/page-NNN.png        a render of every page
  <out>/pages/contact-sheet.png   all pages in one image
  <out>/assets/images/            embedded raster images (deduplicated)
  <out>/assets/chrome/            crops (PNG and SVG) of elements repeated across pages: logo candidates
  <out>/assets/fonts-embedded/    only with --dump-fonts; subsets, evidence only, never reusable

Note: PyMuPDF is AGPL-licensed. It is used here as a command-line tool. The
framework's `deckster brand extract` is expected to replace this script with pdf.js
or MuPDF bindings and keep the same output format.
"""
from __future__ import annotations

import argparse
import io
import math
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _common as C  # noqa: E402
import _filesafe as F  # noqa: E402


def int_to_hex(v: int) -> str:
    return "#%06X" % (v & 0xFFFFFF)


def nb(rect, pw, ph):
    """Normalised bbox [x, y, w, h] in 0..1 of the page, origin top-left."""
    x0, y0, x1, y1 = rect
    return [round(x0 / pw, 4), round(y0 / ph, 4), round((x1 - x0) / pw, 4), round((y1 - y0) / ph, 4)]


def font_metadata(doc, xref: int, dump_dir: Path | None) -> dict:
    """Read the name table and OS/2 flags of an embedded font program, when there is one."""
    meta: dict = {}
    try:
        name, ext, ftype, buf = doc.extract_font(xref)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}
    meta["embedded"] = bool(buf)
    meta["format"] = ext
    if not buf:
        return meta
    if dump_dir is not None and ext in ("ttf", "otf", "cff"):
        dump_dir.mkdir(parents=True, exist_ok=True)
        safe = re.sub(r"[^A-Za-z0-9+_.-]", "_", name)
        (dump_dir / f"{safe}.{ext}").write_bytes(buf)
    if ext not in ("ttf", "otf"):
        return meta
    try:
        from fontTools.ttLib import TTFont  # noqa: PLC0415

        tt = TTFont(io.BytesIO(buf), lazy=True)
        if "name" in tt:
            names = {n.nameID: str(n) for n in tt["name"].names}
            for key, nid in (("copyright", 0), ("name_family", 1), ("name_style", 2), ("name_full", 4), ("version", 5),
                             ("postscript", 6), ("trademark", 7), ("manufacturer", 8), ("designer", 9),
                             ("license", 13), ("license_url", 14), ("typographic_family", 16)):
                if names.get(nid):
                    meta[key] = names[nid][:300]
        if "OS/2" in tt:
            os2 = tt["OS/2"]
            meta["weight_class"] = os2.usWeightClass
            meta["fs_type"] = os2.fsType
            meta["vendor"] = getattr(os2, "achVendID", None)
            upm = tt["head"].unitsPerEm
            for key, attr in (("x_height", "sxHeight"), ("cap_height", "sCapHeight")):
                v = getattr(os2, attr, None)
                if v:
                    meta[key] = round(v / upm, 4)
    except Exception as exc:  # noqa: BLE001
        meta["metadata_error"] = str(exc)[:200]
    return meta


def parse_shadings(doc) -> list[dict]:
    """Read axial and radial shadings straight from the PDF objects: exact stops and direction."""
    num = r"-?\d*\.?\d+"
    out = []
    for xref in range(1, doc.xref_length()):
        try:
            obj = doc.xref_object(xref, compressed=True)
        except Exception:  # noqa: BLE001
            continue
        if "/ShadingType" not in obj:
            continue
        m = re.search(r"/ShadingType\s+(\d)", obj)
        stype = int(m.group(1)) if m else 0
        if stype not in (2, 3):
            out.append({"xref": xref, "type": f"shading-type-{stype}", "stops": [], "origin": "pdf-shading",
                        "note": "Mesh or function-based shading: read the colours from the page image."})
            continue

        def resolve(text: str) -> str:
            mm = re.fullmatch(r"\s*(\d+) 0 R\s*", text)
            return doc.xref_object(int(mm.group(1)), compressed=True) if mm else text

        def fn_stops(fn: str, lo: float, hi: float) -> list[tuple[float, str]]:
            fn = resolve(fn)
            ftype = re.search(r"/FunctionType\s+(\d)", fn)
            if ftype and ftype.group(1) == "2":
                c0 = re.search(r"/C0\s*\[([^\]]*)\]", fn)
                c1 = re.search(r"/C1\s*\[([^\]]*)\]", fn)
                a = [float(x) for x in re.findall(num, c0.group(1))] if c0 else [0, 0, 0]
                b = [float(x) for x in re.findall(num, c1.group(1))] if c1 else [1, 1, 1]
                if len(a) == 1:
                    a, b = a * 3, b * 3
                if len(a) == 3:
                    return [(lo, C.unit_rgb_to_hex(a)), (hi, C.unit_rgb_to_hex(b))]
                return []
            if ftype and ftype.group(1) == "3":
                bounds = re.search(r"/Bounds\s*\[([^\]]*)\]", fn)
                bs = [float(x) for x in re.findall(num, bounds.group(1))] if bounds else []
                fm = re.search(r"/Functions\s*\[(.*)\]\s*(?:/|>>)", fn, re.S)
                if not fm:
                    return []
                body = fm.group(1)
                subs = re.findall(r"\d+ 0 R|<<.*?>>", body, re.S)
                edges = [0.0, *bs, 1.0]
                stops: list[tuple[float, str]] = []
                for i, sub in enumerate(subs[: len(edges) - 1]):
                    stops += fn_stops(sub, lo + (hi - lo) * edges[i], lo + (hi - lo) * edges[i + 1])
                return stops
            return []

        fm = re.search(r"/Function\s*(\d+ 0 R|<<.*?>>(?=\s*/|\s*>>))", obj, re.S)
        raw = fn_stops(fm.group(1), 0.0, 1.0) if fm else []
        stops = []
        for pos, hx in raw:
            if stops and stops[-1]["hex"] == hx and abs(stops[-1]["pos"] - pos) < 1e-6:
                continue
            stops.append({"pos": round(pos, 4), "hex": hx})
        entry = {"xref": xref, "type": "linear" if stype == 2 else "radial", "stops": stops, "origin": "pdf-shading"}
        cm = re.search(r"/Coords\s*\[([^\]]*)\]", obj)
        mm = re.search(r"/Matrix\s*\[([^\]]*)\]", obj)
        if cm and stype == 2:
            x0, y0, x1, y1 = [float(v) for v in re.findall(num, cm.group(1))][:4]
            a, b, c, d = ([float(v) for v in re.findall(num, mm.group(1))][:4] if mm else [1, 0, 0, 1])
            # To PDF user space (y up), then flip y for screen space.
            dx = a * (x1 - x0) + c * (y1 - y0)
            dy = -(b * (x1 - x0) + d * (y1 - y0))
            entry["css_angle_deg"] = round(math.degrees(math.atan2(dx, -dy)) % 360)
        if not mm:
            entry["note"] = "No pattern matrix on this object: the angle is relative to the drawing's own coordinate system. Confirm against the page image."
        out.append(entry)
    return out


def repeated_regions(page_elems: list[list[tuple]], n_pages: int, need: int | None = None, same_pages: bool = False) -> list[dict]:
    """Elements with the same signature on many pages are chrome: logo, footer, rules."""
    if need is None:
        need = max(3, math.ceil(n_pages * 0.4)) if n_pages >= 4 else n_pages if n_pages > 1 else 99
    counts: Counter = Counter()
    where: dict = defaultdict(list)
    for pno, elems in enumerate(page_elems):
        for sig in set(elems):
            counts[sig] += 1
            where[sig].append(pno)
    chrome = [sig for sig, n in counts.items() if n >= need]
    regions: list[dict] = []
    for sig in sorted(chrome, key=lambda s: (s[1][1], s[1][0])):
        kind, box = sig[0], sig[1]
        for r in regions:
            bx = r["box"]
            gap = 0.02
            if not (box[0] > bx[2] + gap or box[2] < bx[0] - gap or box[1] > bx[3] + gap or box[3] < bx[1] - gap) and (not same_pages or r["pages"] == set(where[sig])):
                r["box"] = [min(bx[0], box[0]), min(bx[1], box[1]), max(bx[2], box[2]), max(bx[3], box[3])]
                r["kinds"].add(kind)
                r["pages"] &= set(where[sig])
                if kind == "text":
                    r["text"].append(sig[2])
                break
        else:
            regions.append({"box": list(box), "kinds": {kind}, "pages": set(where[sig]), "text": [sig[2]] if kind == "text" else []})
    return regions


def detect_charts(drawings: list[dict], spans: list[dict], pw: float, ph: float) -> list[dict]:
    """Heuristic chart detection from vector marks. Low confidence by design: confirm on the page image."""
    charts = []
    filled = [d for d in drawings if d["fill"] and d["w"] > 4 and d["h"] > 4 and d["w"] * d["h"] < 0.5 * pw * ph]
    thin_h = [d for d in drawings if d["h"] <= 3.5 and d["w"] > 0.2 * pw]
    thin_v = [d for d in drawings if d["w"] <= 3.5 and d["h"] > 0.2 * ph]

    def bars(group_key, extent_key, thickness_key):
        groups = defaultdict(list)
        for d in filled:
            groups[round(d[group_key] / 2)].append(d)
        best = None
        for g in groups.values():
            if len(g) < 3:
                continue
            ext = [d[extent_key] for d in g]
            thick = [d[thickness_key] for d in g]
            if max(ext) <= 0 or (max(ext) - min(ext)) / max(ext) < 0.08:
                continue  # equal extents: cards or a row of tiles, not bars
            if (max(thick) - min(thick)) / max(thick) > 0.25:
                continue
            if best is None or len(g) > len(best):
                best = g
        return best

    vbars = bars("y1", "h", "w")
    hbars = bars("x0", "w", "h")
    marks, kind = (vbars, "bar-vertical") if vbars and (not hbars or len(vbars) >= len(hbars)) else (hbars, "bar-horizontal")
    lines = [d for d in drawings if d["stroke"] and not d["fill"] and d["segments"] >= 4 and d["w"] > 0.15 * pw and d["h"] > 6]
    # Skia and some exporters expand strokes into filled outlines: many segments, thin, wide.
    lines += [d for d in drawings if d["fill"] and not d["stroke"] and d["segments"] >= 12 and d["w"] > 0.25 * pw and 6 < d["h"] < 0.6 * ph
              and d not in (marks or [])]
    grid_rows = sorted({round(d["y0"]) for d in thin_h})
    region = None
    if marks:
        region = [min(d["x0"] for d in marks), min(d["y0"] for d in marks), max(d["x1"] for d in marks), max(d["y1"] for d in marks)]
    elif len(lines) >= 1 and len(grid_rows) >= 3:
        kind = "line"
        marks = lines
        region = [min(d["x0"] for d in lines), min(d["y0"] for d in lines), max(d["x1"] for d in lines), max(d["y1"] for d in lines)]
    if not region:
        return charts
    grid = [d for d in thin_h if d["x1"] > region[0] and d["x0"] < region[2] and region[1] - 0.1 * ph <= d["y0"] <= region[3] + 0.05 * ph]
    if grid:
        region = [min(region[0], min(d["x0"] for d in grid)), min(region[1], min(d["y0"] for d in grid)),
                  max(region[2], max(d["x1"] for d in grid)), max(region[3], max(d["y1"] for d in grid))]
    pad_x, pad_y = 0.08 * pw, 0.07 * ph
    box = [max(0, region[0] - pad_x), max(0, region[1] - pad_y), min(pw, region[2] + pad_x * 2.2), min(ph, region[3] + pad_y)]
    inside = [s for s in spans if s["bbox"][0] >= box[0] - 2 and s["bbox"][2] <= box[2] + 2 and s["bbox"][1] >= box[1] - 2 and s["bbox"][3] <= box[3] + 2]
    series: Counter = Counter()
    for d in marks:
        series[d["fill"] or d["stroke"]] += d["w"] * d["h"] if d["fill"] else d["w"]
    if kind != "line":
        for d in lines:
            if region[0] - 5 <= d["x0"] and d["x1"] <= region[2] + pad_x:
                series[d["stroke"] or d["fill"]] += 1
    grid_colors = Counter((d["fill"] or d["stroke"]) for d in grid)
    label_styles: Counter = Counter()
    numfmts = []
    for s in inside:
        label_styles[(s["family"], s["weight"], round(s["size"], 1), s["color"])] += len(s["text"])
        nf = C.number_format_of(s["text"])
        if nf:
            numfmts.append(nf)
    in_region_marks = [s for s in inside if region[0] <= (s["bbox"][0] + s["bbox"][2]) / 2 <= region[2] + pad_x and region[1] - pad_y <= s["bbox"][1] <= region[3]]
    styles = [{"family": k[0], "weight": k[1], "size_pt": k[2], "size_canvas_px": round(k[2] * 1080 / ph, 1), "color": k[3], "chars": v}
              for k, v in label_styles.most_common(5)]
    confidence = 0.35 + (0.25 if len(grid) >= 3 else 0) + (0.2 if numfmts else 0) + (0.1 if len(marks) >= 4 else 0)
    charts.append({
        "kind_guess": kind,
        "origin": "vector-heuristic",
        "confidence": round(min(confidence, 0.9), 2),
        "bbox": nb(box, pw, ph),
        "mark_count": len(marks),
        "series_colors": [{"hex": h, "weight": round(w, 1)} for h, w in series.most_common(8)],
        "highlight_pattern": bool(len(series) == 2 and kind.startswith("bar") and min(series.values()) / max(sum(series.values()), 1) < 0.5),
        "bar_corner_rounded": any(d["curves"] >= 2 for d in marks) if kind.startswith("bar") else None,
        "line_width_pt": statistics.median([d["stroke_width"] for d in lines if d["stroke_width"]]) if any(d["stroke_width"] for d in lines) else None,
        "gridlines": {
            "count": len(grid),
            "color": grid_colors.most_common(1)[0][0] if grid else None,
            "thickness_pt": round(statistics.median([min(d["h"], d["stroke_width"] or d["h"]) for d in grid]), 2) if grid else None,
            "dashed_guess": any(d["segments"] > 6 for d in grid) if grid else None,
            "vertical_count": len([d for d in thin_v if region[0] <= d["x0"] <= region[2]]),
        },
        "text_styles": styles,
        "number_formats": numfmts[:12],
        "has_legend_guess": None,
        "direct_labels_guess": len(in_region_marks) >= len(marks) if kind.startswith("bar") else None,
        "note": "Detected from vector shapes. Kind, series and label roles are guesses; verify on the page image.",
    })
    return charts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-pages", type=int, default=60)
    ap.add_argument("--render-width", type=int, default=1920)
    ap.add_argument("--dump-fonts", action="store_true", help="save embedded font subsets (evidence only)")
    ap.add_argument("--source-type", default="pdf", help="label written to source.type (gslides export, pptx render...)")
    args = ap.parse_args()

    import pymupdf  # noqa: PLC0415

    try:
        F.check_file_size(args.pdf, F.MAX_PDF_BYTES, "the PDF")
    except F.Refused as exc:
        sys.exit(str(exc))
    doc = pymupdf.open(args.pdf)
    out = args.out
    (out / "pages").mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    n = min(doc.page_count, args.max_pages, F.MAX_RENDER_PAGES)
    if doc.page_count > n:
        warnings.append(f"Only the first {n} of {doc.page_count} pages were read (--max-pages).")
    pw, ph = doc[0].rect.width, doc[0].rect.height
    to_canvas = 1080 / ph

    # ---- fonts
    fonts: dict[str, dict] = {}
    for pno in range(n):
        for xref, ext, ftype, basefont, _name, enc, *_ in doc[pno].get_fonts(full=True):
            if basefont in fonts:
                fonts[basefont]["pages"].add(pno + 1)
                continue
            parsed = C.parse_font_name(basefont)
            meta = font_metadata(doc, xref, (out / "assets/fonts-embedded") if args.dump_fonts else None) if xref else {}
            file_family = meta.get("typographic_family") or meta.get("name_family")
            if file_family:
                # The name table spells the family correctly ('JetBrains Mono'); PostScript names do not.
                # Static instances cut from variable fonts carry a weight word in the family: drop it.
                parsed["family"] = re.sub(r"(\s(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black|Italic))+$", "", file_family).strip() or file_family
            fonts[basefont] = {**parsed, "pdf_type": ftype, "encoding": enc, **meta, "pages": {pno + 1}, "chars": 0, "sizes": Counter()}

    def font_key(span_font: str) -> str | None:
        for raw in fonts:
            if raw == span_font or raw.endswith("+" + span_font):
                return raw
        return None

    # ---- pages
    color_uses: dict[str, dict] = defaultdict(lambda: {"text": 0.0, "fill": 0.0, "stroke": 0.0, "background": 0.0, "pages": set()})
    text_styles: dict[tuple, dict] = {}
    pages = []
    page_elems: list[list[tuple]] = []
    image_index: dict[int, dict] = {}
    radii: Counter = Counter()
    strokes: Counter = Counter()
    all_big_numbers, all_charts, all_tables = [], [], []
    page_images = []
    skipped_images: set[int] = set()
    total_chars = 0

    for pno in range(n):
        page = doc[pno]
        zoom, lowered = F.capped_zoom(page.rect.width, page.rect.height, args.render_width)
        if lowered:
            warnings.append(f"page {pno + 1}: rendered smaller than asked, its shape would need more than {F.MAX_PIXELS} pixels")
        img_path = out / "pages" / f"page-{pno + 1:03d}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(img_path)
        page_images.append(img_path)
        elems: list[tuple] = []

        spans = []
        blocks_out = []
        for b in page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_LIGATURES | pymupdf.TEXT_PRESERVE_WHITESPACE)["blocks"]:
            if b.get("type") != 0:
                continue
            block_spans = []
            for line in b["lines"]:
                for s in line["spans"]:
                    text = s["text"]
                    if not text.strip():
                        continue
                    key = font_key(s["font"])
                    info = fonts.get(key) if key else None
                    parsed = info or C.parse_font_name(s["font"])
                    hexc = int_to_hex(s["color"])
                    sp = {"text": text.strip(), "family": parsed["family"], "weight": parsed.get("weight_class") or parsed["weight"],
                          "italic": parsed["italic"], "size": s["size"], "color": hexc, "bbox": list(s["bbox"]), "font_raw": key or s["font"]}
                    spans.append(sp)
                    block_spans.append(sp)
                    nchar = len(text.strip())
                    total_chars += nchar
                    if info:
                        info["chars"] += nchar
                        info["sizes"][round(s["size"], 1)] += nchar
                    color_uses[hexc]["text"] += nchar
                    color_uses[hexc]["pages"].add(pno + 1)
                    sk = (sp["family"], sp["weight"], sp["italic"], round(s["size"], 1), hexc)
                    st = text_styles.setdefault(sk, {"chars": 0, "pages": set(), "sample": text.strip()[:60], "letter_case": Counter(), "tops": []})
                    st["tops"].append((pno, round(s["bbox"][0]), s["origin"][1]))
                    st["chars"] += nchar
                    st["pages"].add(pno + 1)
                    st["letter_case"]["upper" if text.isupper() and any(ch.isalpha() for ch in text) else "mixed"] += nchar
                    elems.append(("text", tuple(round(v / d, 2) for v, d in zip(s["bbox"], (pw, ph, pw, ph))), text.strip()[:40]))
            if block_spans:
                lead = max(block_spans, key=lambda x: (x["size"], len(x["text"])))
                bb = [min(s["bbox"][0] for s in block_spans), min(s["bbox"][1] for s in block_spans),
                      max(s["bbox"][2] for s in block_spans), max(s["bbox"][3] for s in block_spans)]
                line_tops = sorted({round(s["bbox"][1], 1) for s in block_spans if abs(s["size"] - lead["size"]) < 0.5})
                leading = None
                if len(line_tops) >= 2:
                    gaps = [b2 - a2 for a2, b2 in zip(line_tops, line_tops[1:]) if b2 - a2 > lead["size"] * 0.6]
                    if gaps:
                        leading = round(statistics.median(gaps) / lead["size"], 2)
                blocks_out.append({
                    "bbox": nb(bb, pw, ph), "text": " ".join(s["text"] for s in block_spans)[:160],
                    "family": lead["family"], "weight": lead["weight"], "size_pt": round(lead["size"], 1),
                    "size_canvas_px": round(lead["size"] * to_canvas, 1), "color": lead["color"], "line_height_ratio": leading,
                })

        drawings = []
        has_vector_bg = False
        for d in page.get_drawings():
            r = d["rect"]
            fill = C.unit_rgb_to_hex(d["fill"]) if d.get("fill") else None
            stroke = C.unit_rgb_to_hex(d["color"]) if d.get("color") and d["type"] in ("s", "fs") else None
            items = d["items"]
            curves = sum(1 for it in items if it[0] == "c")
            rec = {"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1, "w": r.width, "h": r.height, "fill": fill, "stroke": stroke,
                   "stroke_width": d.get("width") if stroke else None, "segments": len(items), "curves": curves,
                   "dashes": d.get("dashes") if stroke else None}
            drawings.append(rec)
            area = max(r.width, 1) * max(r.height, 1) / (pw * ph)
            page_sized = r.width >= 0.98 * pw and r.height >= 0.98 * ph
            has_vector_bg = has_vector_bg or (page_sized and bool(fill))
            if fill:
                color_uses[fill]["background" if page_sized else "fill"] += 1.0 if page_sized else area
                color_uses[fill]["pages"].add(pno + 1)
            if stroke:
                color_uses[stroke]["stroke"] += (r.width + r.height) / (pw + ph)
                color_uses[stroke]["pages"].add(pno + 1)
                strokes[(stroke, round(d.get("width") or 0, 2))] += 1
            # Rounded rectangle: four corner curves plus straight edges. Radius from the first curve's extent.
            if curves >= 4 and r.width > 20 and r.height > 20 and (fill or stroke):
                # Rounded rectangle: the straight top edge starts one radius in from the bounding box.
                tops = [it for it in items if it[0] == "l" and abs(it[1].y - it[2].y) < 0.3 and abs(it[1].y - r.y0) < 1.0]
                if tops:
                    rad = min(min(it[1].x, it[2].x) for it in tops) - r.x0
                    if rad >= 0.45 * min(r.width, r.height):
                        radii["pill"] += 1
                    elif rad > 0.5:
                        radii[round(rad * to_canvas)] += 1
                elif abs(r.width - r.height) > 0.2 * max(r.width, r.height) and curves <= 8 and len(items) <= 12:
                    radii["pill"] += 1
            elif len(items) == 1 and items[0][0] == "re" and r.width > 40 and r.height > 40 and not page_sized:
                radii[0] += 1
            if not page_sized:
                elems.append(("vector", tuple(round(v / dd, 2) for v, dd in zip((r.x0, r.y0, r.x1, r.y1), (pw, ph, pw, ph))), fill or stroke))

        imgs_out = []
        for im in page.get_images(full=True):
            xref = im[0]
            try:
                rects = page.get_image_rects(xref)
            except Exception:  # noqa: BLE001
                rects = []
            if xref not in image_index:
                if im[2] * im[3] > F.MAX_PIXELS or len(image_index) >= F.MAX_MEDIA_FILES:
                    if xref not in skipped_images:
                        skipped_images.add(xref)
                        warnings.append(f"image xref {xref} not extracted: {im[2]}x{im[3]} pixels is over the limit, or more than {F.MAX_MEDIA_FILES} images")
                    continue
                try:
                    pix = pymupdf.Pixmap(doc, xref)
                    if pix.n - pix.alpha >= 4:
                        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                    (out / "assets/images").mkdir(parents=True, exist_ok=True)
                    f = out / "assets/images" / f"image-x{xref}.png"
                    pix.save(f)
                    image_index[xref] = {"file": str(f.relative_to(out)), "width": pix.width, "height": pix.height, "pages": [], "placements": []}
                except Exception as exc:  # noqa: BLE001
                    warnings.append(f"image xref {xref} could not be extracted: {exc}")
                    continue
            for r in rects:
                image_index[xref]["placements"].append({"page": pno + 1, "bbox": nb(r, pw, ph)})
                imgs_out.append({"asset": image_index[xref]["file"], "bbox": nb(r, pw, ph)})
                elems.append(("image", tuple(round(v / dd, 2) for v, dd in zip((r.x0, r.y0, r.x1, r.y1), (pw, ph, pw, ph))), xref))
            if pno + 1 not in image_index[xref]["pages"]:
                image_index[xref]["pages"].append(pno + 1)

        bg = C.analyze_background(img_path)
        bg["_counted"] = has_vector_bg
        if bg["kind"] == "solid" and not has_vector_bg:
            color_uses[bg["hex"]]["background"] += 1.0
            color_uses[bg["hex"]]["pages"].add(pno + 1)

        charts = detect_charts(drawings, spans, pw, ph)
        for ch in charts:
            ch["page"] = pno + 1
        all_charts += charts

        tables = []
        try:
            for t in page.find_tables().tables:
                if t.row_count >= 2 and t.col_count >= 2:
                    tables.append({"page": pno + 1, "bbox": nb(t.bbox, pw, ph), "rows": t.row_count, "cols": t.col_count, "origin": "pymupdf-find-tables",
                                   "note": "Geometry only. Read header fill, banding and borders from the page image."})
        except Exception:  # noqa: BLE001
            pass
        all_tables += tables

        pages.append({"index": pno + 1, "image": str(img_path.relative_to(out)), "background": bg, "text_blocks": sorted(blocks_out, key=lambda b: -b["size_pt"])[:14],
                      "images": imgs_out, "vector_count": len(drawings), "palette": C.image_palette(img_path, 8),
                      "charts": len(charts), "tables": len(tables), "_spans": spans})
        page_elems.append(elems)

    # Renderers truncate where the PDF rounds (#F6F4ED on screen for a stored #F7F4EE): snap page
    # backgrounds read from pixels to the exact vector colour when one is within a hair.
    exact = [h for h, u in color_uses.items() if u["fill"] or u["text"] or u["stroke"]]
    for pg in pages:
        bgp = pg["background"]
        bgp.pop("_counted", None)
        if bgp["kind"] == "solid":
            near = [h for h in exact if h != bgp["hex"] and C.delta_e(h, bgp["hex"]) < 1.2]
            if near:
                best = min(near, key=lambda h: C.delta_e(h, bgp["hex"]))
                if bgp["hex"] in color_uses:
                    color_uses[best]["background"] += color_uses.pop(bgp["hex"])["background"]
                color_uses[best]["pages"].add(pg["index"])
                bgp["hex_from_pixels"], bgp["hex"] = bgp["hex"], best

    # ---- body size, big numbers, layout hints
    size_chars: Counter = Counter()
    for (fam, w, it, size, col), st in text_styles.items():
        size_chars[size] += st["chars"]
    body_size = size_chars.most_common(1)[0][0] if size_chars else 12.0
    for pg in pages:
        spans = pg.pop("_spans")
        bigs = []
        for s in spans:
            nf = C.number_format_of(s["text"])
            if nf and s["size"] >= max(1.8 * body_size, 44 / to_canvas) and any(ch.isdigit() for ch in s["text"]):
                below = [o for o in spans if o is not s and o["bbox"][1] >= s["bbox"][3] - s["size"] * 0.3 and o["bbox"][1] - s["bbox"][3] < s["size"] * 1.2
                         and o["bbox"][0] < s["bbox"][2] and o["bbox"][2] > s["bbox"][0] and o["size"] < s["size"] * 0.6]
                label = min(below, key=lambda o: o["bbox"][1]) if below else None
                bigs.append({"page": pg["index"], "text": s["text"], "family": s["family"], "weight": s["weight"], "size_pt": round(s["size"], 1),
                             "size_canvas_px": round(s["size"] * to_canvas, 1), "color": s["color"], "bbox": nb(s["bbox"], pw, ph), "format": nf,
                             "label": {"text": label["text"][:60], "family": label["family"], "weight": label["weight"], "size_canvas_px": round(label["size"] * to_canvas, 1),
                                       "color": label["color"], "position": "below"} if label else None})
        if any(c["page"] == pg["index"] for c in all_charts):
            cboxes = [c["bbox"] for c in all_charts if c["page"] == pg["index"]]
            bigs = [b for b in bigs if not any(cb[0] <= b["bbox"][0] <= cb[0] + cb[2] and cb[1] <= b["bbox"][1] <= cb[1] + cb[3] for cb in cboxes)]
        all_big_numbers += bigs
        blocks = pg["text_blocks"]
        hints = []
        mono_chars = sum(len(b["text"]) for b in blocks if re.search(r"mono|courier|consol|menlo|code", b["family"], re.I))
        all_chars = sum(len(b["text"]) for b in blocks) or 1
        if pg["charts"]:
            hints.append("chart")
        if pg["tables"]:
            hints.append("table")
        if len(bigs) >= 2:
            hints.append("stats")
        elif len(bigs) == 1:
            hints.append("big-number")
        if blocks and blocks[0]["text"][:1] in "“\"‘«":
            hints.append("quote")
        if mono_chars / all_chars > 0.35 and not pg["charts"]:
            hints.append("code")
        if blocks and len(blocks) <= 4 and blocks[0]["size_pt"] >= 2.4 * body_size and all_chars < 160:
            hints.append("title-or-section-or-statement")
        big_imgs = [i for i in pg["images"] if i["bbox"][2] * i["bbox"][3] > 0.2]
        if big_imgs:
            hints.append("full-bleed-image" if big_imgs[0]["bbox"][2] * big_imgs[0]["bbox"][3] > 0.85 else "split-with-image")
        pg["layout_hints"] = hints
        pg["text_chars"] = all_chars

    # ---- chrome regions and logo candidates
    chrome_out = []
    if n >= 2:
        regions = repeated_regions(page_elems, n)
        # A second, looser pass for page corners only: a reversed logo may appear on just the title and closing pages.
        corner = [[e for e in elems if e[0] != "text" and (e[1][2] < 0.3 or e[1][0] > 0.7) and (e[1][3] < 0.18 or e[1][1] > 0.82)] for elems in page_elems]
        known = [(r["box"], set(r["pages"])) for r in regions]
        for r in repeated_regions(corner, n, need=2, same_pages=True) if n >= 3 else []:
            same_place_same_pages = any(abs(r["box"][0] - b[0]) < 0.03 and abs(r["box"][1] - b[1]) < 0.03 and r["pages"] <= pg for b, pg in known)
            if not same_place_same_pages:
                r["rare"] = True
                regions.append(r)
        (out / "assets/chrome").mkdir(parents=True, exist_ok=True)
        for i, r in enumerate(regions[:12]):
            bx = r["box"]
            if (bx[2] - bx[0]) * (bx[3] - bx[1]) > 0.25 or not r["pages"]:
                continue
            first = min(r["pages"])
            page = doc[first]
            pad = 4
            clip = pymupdf.Rect(bx[0] * pw - pad, bx[1] * ph - pad, bx[2] * pw + pad, bx[3] * ph + pad) & page.rect
            if clip.is_empty or clip.width < 4 or clip.height < 4 or clip.width * clip.height * 16 > F.MAX_PIXELS:
                continue
            png = out / "assets/chrome" / f"chrome-{i + 1:02d}.png"
            page.get_pixmap(matrix=pymupdf.Matrix(4, 4), clip=clip, alpha=False).save(png)
            svg_rel = None
            try:
                tmp = pymupdf.open()
                tmp.insert_pdf(doc, from_page=first, to_page=first)
                tmp[0].set_cropbox(clip)
                svg = tmp[0].get_svg_image(text_as_path=True)
                svgp = out / "assets/chrome" / f"chrome-{i + 1:02d}.svg"
                svgp.write_text(svg)
                svg_rel = str(svgp.relative_to(out))
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"chrome region {i + 1}: SVG crop failed ({exc})")
            has_graphic = bool(r["kinds"] & {"vector", "image"})
            area = (bx[2] - bx[0]) * (bx[3] - bx[1])
            score = (0.5 if has_graphic else 0.1) + (0.3 if area < 0.03 else 0.1) + 0.2 * len(r["pages"]) / n
            cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
            chrome_out.append({
                "png": str(png.relative_to(out)), "svg": svg_rel, "bbox": [round(bx[0], 3), round(bx[1], 3), round(bx[2] - bx[0], 3), round(bx[3] - bx[1], 3)],
                "placement": ("top" if cy < 0.33 else "bottom" if cy > 0.67 else "middle") + "-" + ("left" if cx < 0.33 else "right" if cx > 0.67 else "center"),
                "pages": sorted(p + 1 for p in r["pages"]), "kinds": sorted(r["kinds"]), "text": r["text"][:4],
                "logo_candidate_score": round(score, 2), "rare_variant": bool(r.get("rare")),
                "note": "The SVG is the whole first page clipped to this box (text as outlines), so it also holds the page background and off-box content. "
                        "Use it as the source of exact paths and colours and rebuild a clean logo file from it; use the PNG to check the result.",
            })
        chrome_out.sort(key=lambda c: -c["logo_candidate_score"])

    # ---- gradients
    shadings = parse_shadings(doc)
    grads: dict[tuple, dict] = {}
    for s in shadings:
        key = (s["type"], s.get("css_angle_deg"), tuple(st["hex"] for st in s["stops"]))
        g = grads.setdefault(key, {**{k: v for k, v in s.items() if k != "xref"}, "occurrences": 0})
        g["occurrences"] += 1
    pixel_grad_pages = [p for p in pages if p["background"]["kind"] == "gradient"]
    gradients = list(grads.values())
    if pixel_grad_pages:
        for g in gradients:
            g.setdefault("background_pages_guess", [p["index"] for p in pixel_grad_pages])
        if not gradients:
            seen = {}
            for p in pixel_grad_pages:
                b = p["background"]
                k = tuple(s["hex"] for s in b["stops"])
                seen.setdefault(k, {**{kk: vv for kk, vv in b.items() if kk != "kind"}, "pages": []})["pages"].append(p["index"])
            gradients = list(seen.values())
            warnings.append("Gradient backgrounds were found only in the pixels (probably rasterised or a mesh). Stops are estimates.")

    # ---- values stated in the text (brand guidelines spell out hex and RGB values and name the typefaces)
    stated: dict[str, dict] = {}
    for pno in range(n):
        lines = [ln.strip() for ln in doc[pno].get_text("text").splitlines() if ln.strip()]
        for i, ln in enumerate(lines):
            found = [C.norm_hex(m) for m in re.findall(r"#([0-9A-Fa-f]{6})\b", ln)]
            found += [C.norm_hex(m) for m in re.findall(r"\bHEX[:\s]+([0-9A-Fa-f]{6})\b", ln, re.I)]
            found += [C.rgb_to_hex(*map(int, m)) for m in re.findall(r"\bRGB[:\s]*\(?(\d{1,3})[\s,/]+(\d{1,3})[\s,/]+(\d{1,3})", ln, re.I) if all(int(v) <= 255 for v in m)]
            for hx in found:
                label = next((c for c in (lines[i - 1] if i else "", ln, lines[i - 2] if i > 1 else "") if c and not re.search(r"#[0-9A-Fa-f]{6}|RGB|CMYK|HEX|Pantone|PMS", c, re.I)), "")
                e = stated.setdefault(hx, {"name": label[:40] or None, "hex": hx, "origin": "stated-in-text", "pages": [], "context": ln[:80]})
                if pno + 1 not in e["pages"]:
                    e["pages"].append(pno + 1)
    stated_colors = list(stated.values())

    # ---- assemble
    fonts_out = []
    for raw, f in sorted(fonts.items(), key=lambda kv: -kv[1]["chars"]):
        fam = f.get("name_full") or f.get("name_family") or f["family"]
        entry = {
            "raw": raw, "family": f["family"], "name_in_font_file": fam if f.get("name_family") else None,
            "weight": f.get("weight_class") or f["weight"], "italic": f["italic"], "subset": f["subset"], "embedded": f.get("embedded"),
            "pdf_type": f["pdf_type"], "chars": f["chars"], "share": round(f["chars"] / total_chars, 3) if total_chars else 0,
            "sizes_pt": [{"size": s, "canvas_px": round(s * to_canvas, 1), "chars": c} for s, c in f["sizes"].most_common(8)],
            "pages": sorted(f["pages"]),
            "licence_evidence": {k: f[k] for k in ("copyright", "license", "license_url", "manufacturer", "vendor", "trademark", "fs_type") if f.get(k) not in (None, "")},
            "metrics": {k: f[k] for k in ("x_height", "cap_height") if f.get(k)},
            "reusable": False,
        }
        fonts_out.append(entry)
    if any(f["subset"] for f in fonts.values()):
        warnings.append("Embedded fonts are subsets: they identify the typeface but cannot be reused. Source the full fonts separately.")
    if total_chars == 0:
        warnings.append("No text layer. The PDF is probably rasterised: treat it as images (extract_images.py on pages/).")

    observed_colors = []
    for hx, u in color_uses.items():
        uses = {k: round(v, 4) for k, v in u.items() if k != "pages" and v}
        weight = u["text"] / max(total_chars, 1) + u["fill"] / n + u["background"] / n + 0.3 * u["stroke"] / n
        observed_colors.append({"hex": hx, "weight": round(weight, 4), "page_share": round(len(u["pages"]) / n, 2), "uses": uses, "pages": sorted(u["pages"])})
    observed_colors.sort(key=lambda c: -c["weight"])

    styles_out = []
    for (fam, w, it, size, col), st in sorted(text_styles.items(), key=lambda kv: -kv[1]["chars"]):
        # Line height: distance between baselines of consecutive lines that start at the same x, as a multiple of the size.
        tops = sorted(st["tops"])
        gaps = [(b[2] - a[2]) / size for a, b in zip(tops, tops[1:]) if a[0] == b[0] and abs(a[1] - b[1]) <= 1 and 0.85 <= (b[2] - a[2]) / size <= 2.2]
        styles_out.append({"family": fam, "weight": w, "italic": it, "size_pt": size, "size_canvas_px": round(size * to_canvas, 1), "color": col,
                           "line_height_ratio": round(statistics.median(gaps), 2) if gaps else None,
                           "chars": st["chars"], "pages": sorted(st["pages"]), "sample": st["sample"],
                           "uppercase": st["letter_case"]["upper"] > st["letter_case"]["mixed"]})

    sheet = C.contact_sheet(page_images, out / "pages" / "contact-sheet.png", labels=[f"{p['index']}: {', '.join(p['layout_hints']) or '-'}" for p in pages])

    data = {
        "source": {"type": args.source_type, "path": str(args.pdf.resolve()), "title": doc.metadata.get("title") or None,
                   "producer": doc.metadata.get("producer") or None, "creator": doc.metadata.get("creator") or None,
                   "page_count": doc.page_count, "page_size": {"width": pw, "height": ph, "unit": "pt"}, "aspect": round(pw / ph, 4),
                   "canvas_scale": {"note": "size_canvas_px = size_pt * 1080 / page height", "factor": round(to_canvas, 4)}},
        "tool": {"script": "extract_pdf.py", "pymupdf": pymupdf.__version__},
        "declared": {"colors": stated_colors, "fonts": [],
                     "note": "A PDF has no theme. Colours listed here were written out in the page text (a guidelines document); they outrank observed usage. "
                             "Read the text for typeface names, clear-space rules and usage rules: those are not parsed."},
        "observed": {
            "colors": observed_colors[:60],
            "fonts": fonts_out,
            "text_styles": styles_out[:40],
            "body_size_pt": body_size,
            "gradients": gradients,
            "shapes": {"corner_radii_canvas_px": [{"radius": k, "count": v} for k, v in radii.most_common(8)],
                       "strokes": [{"hex": k[0], "width_pt": k[1], "count": v} for k, v in strokes.most_common(8)]},
        },
        "pages": pages,
        "layouts": [],
        "assets": {"images": list(image_index.values()), "chrome": chrome_out, "contact_sheet": str(sheet.relative_to(out))},
        "dataviz": {"charts": all_charts, "tables": all_tables, "big_numbers": all_big_numbers},
        "warnings": warnings,
    }
    path = C.write_extraction(out, data)
    print(C.summarize(data))
    print("wrote", path)


if __name__ == "__main__":
    main()
