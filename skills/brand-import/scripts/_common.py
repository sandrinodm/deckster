"""Shared helpers for the brand-import extraction scripts.

Pure standard library except the image functions, which import Pillow and numpy
lazily so that extract_pptx.py can parse a deck without them.

Everything here is independent of the final brand schema.
"""
from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Iterable

EXTRACTION_SCHEMA = "brand-extraction/1"

# --------------------------------------------------------------------------- colour


def norm_hex(value: str) -> str:
    v = value.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    return "#" + v[:6].upper()


def rgb_to_hex(r: float, g: float, b: float) -> str:
    """r, g, b in 0..255."""
    return "#%02X%02X%02X" % tuple(max(0, min(255, int(round(c)))) for c in (r, g, b))


def unit_rgb_to_hex(rgb: Iterable[float]) -> str:
    """r, g, b in 0..1 (PDF convention)."""
    r, g, b = list(rgb)[:3]
    return rgb_to_hex(r * 255, g * 255, b * 255)


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = norm_hex(h)[1:]
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _lin(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _delin(c: float) -> float:
    c = max(0.0, min(1.0, c))
    return 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)


def luminance(h: str) -> float:
    r, g, b = (_lin(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    """WCAG 2.x contrast ratio."""
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def hex_to_oklab(h: str) -> tuple[float, float, float]:
    r, g, b = (_lin(c) for c in hex_to_rgb(h))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    )


def oklab_to_hex(L: float, a: float, b: float) -> str:
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return rgb_to_hex(_delin(r), _delin(g), _delin(bb))


def hex_to_oklch(h: str) -> tuple[float, float, float]:
    L, a, b = hex_to_oklab(h)
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360


def in_gamut(L: float, C: float, H: float) -> bool:
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb = (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )
    return all(-0.0005 <= c <= 1.0005 for c in rgb)


def oklch_to_hex(L: float, C: float, H: float) -> str:
    """Convert with chroma reduction when the colour is outside sRGB."""
    L = max(0.0, min(1.0, L))
    lo, hi = 0.0, C
    if not in_gamut(L, C, H):
        for _ in range(24):
            mid = (lo + hi) / 2
            if in_gamut(L, mid, H):
                lo = mid
            else:
                hi = mid
        C = lo
    return oklab_to_hex(L, C * math.cos(math.radians(H)), C * math.sin(math.radians(H)))


def delta_e(a: str, b: str) -> float:
    """Euclidean distance in OKLab, scaled by 100. About 2 is a just-noticeable difference."""
    la, lb = hex_to_oklab(a), hex_to_oklab(b)
    return 100 * math.dist(la, lb)


def is_neutral(h: str, chroma: float = 0.03) -> bool:
    return hex_to_oklch(h)[1] < chroma


def cluster_colors(weighted: dict[str, float], threshold: float = 3.0) -> list[dict]:
    """Greedy merge of near-identical colours.

    The representative of a cluster is its heaviest member, not the mean, so an
    exact brand hex survives anti-aliasing and JPEG noise around it.
    """
    clusters: list[dict] = []
    for hexv, w in sorted(weighted.items(), key=lambda kv: -kv[1]):
        for c in clusters:
            if delta_e(c["hex"], hexv) <= threshold:
                c["weight"] += w
                c["members"].append(hexv)
                break
        else:
            clusters.append({"hex": hexv, "weight": w, "members": [hexv]})
    clusters.sort(key=lambda c: -c["weight"])
    return clusters


# Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB.
_CVD = {
    "protanopia": ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    "deuteranopia": ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
    "tritanopia": ((1.255528, -0.076749, -0.178779), (-0.078411, 0.930809, 0.147602), (0.004733, 0.691367, 0.303900)),
}


def simulate_cvd(h: str, kind: str) -> str:
    r, g, b = (_lin(c) for c in hex_to_rgb(h))
    m = _CVD[kind]
    return rgb_to_hex(*(_delin(row[0] * r + row[1] * g + row[2] * b) for row in m))


# --------------------------------------------------------------------------- fonts

_WEIGHT_WORDS = [
    ("extralight", 200), ("ultralight", 200), ("semibold", 600), ("demibold", 600), ("extrabold", 800),
    ("ultrabold", 800), ("hairline", 100), ("thin", 100), ("light", 300), ("regular", 400), ("normal", 400),
    ("book", 400), ("roman", 400), ("medium", 500), ("demi", 600), ("bold", 700), ("heavy", 900), ("black", 900),
]
_STYLE_WORDS = ("italic", "oblique", "condensed", "narrow", "extended", "expanded", "mt", "ps", "std", "pro", "lt")


def parse_font_name(raw: str) -> dict:
    """Split a PostScript or PDF font name into family, weight and style.

    'ABCDEF+HelveticaNeue-BoldItalic' -> family 'Helvetica Neue', weight 700, italic, subset.
    The six-letter prefix marks an embedded subset, which cannot be reused as a font file.
    """
    name = raw.strip()
    subset = bool(re.match(r"^[A-Z]{6}\+", name))
    if subset:
        name = name[7:]
    name = name.split(",")[0] if "," in name and "-" not in name else name.replace(",", "-")
    base, _, style = name.partition("-")
    style_l = style.lower()
    weight, italic = None, False
    hay = style_l or ""
    for word, w in _WEIGHT_WORDS:
        if word in hay:
            weight = w
            break
    if "italic" in hay or "oblique" in hay or re.search(r"(?<![a-z])it$", hay):
        italic = True
    if not style:
        # 'Arial Bold', 'ArialMT', 'Arial-BoldMT' styles without a dash
        m = re.search(r"\s(bold|light|medium|semibold|black|thin|italic|regular)(\s|$)", base, re.I)
        if m:
            for word, w in _WEIGHT_WORDS:
                if word in base.lower():
                    weight = w
                    break
            italic = "italic" in base.lower()
            base = re.sub(r"\s(Bold|Light|Medium|SemiBold|Semibold|Black|Thin|Italic|Regular)\b", "", base, flags=re.I)
    base = re.sub(r"(MT|PS|PSMT)$", "", base)
    family = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=\d)", " ", base).strip()
    return {
        "raw": raw,
        "family": family,
        "weight": weight or 400,
        "italic": italic,
        "subset": subset,
        "style_token": style or None,
    }


# --------------------------------------------------------------------------- numbers

_NUM_RE = re.compile(
    r"^\s*(?P<pre>[~≈<>+\-−±]?\s*[$€£¥]?)\s*(?P<num>\d[\d.,\s]*\d|\d)\s*(?P<suf>%|‰|x|×|pp|bps|[kKmMbBtT]n?|bn|Mt|ms|s|min|h|yrs?|\+)?\s*(?P<unit>[A-Za-z€$£%/]{0,6})\s*$"
)


def number_format_of(text: str) -> dict | None:
    """Describe how a displayed number is written ('4.1 min', '$1.2bn', '62%')."""
    t = text.strip()
    if not t or len(t) > 14:
        return None
    m = _NUM_RE.match(t)
    if not m:
        return None
    num = m.group("num").replace(" ", "")
    decimals = 0
    dec_sep = None
    thou_sep = None
    last = max(num.rfind("."), num.rfind(","))
    if last != -1:
        tail = num[last + 1:]
        if len(tail) == 3 and num.count(num[last]) >= 1 and len(num) > 4 and not (num.count(".") and num.count(",")):
            thou_sep = num[last]
        else:
            dec_sep = num[last]
            decimals = len(tail)
            other = "," if dec_sep == "." else "."
            if other in num:
                thou_sep = other
    return {
        "text": t,
        "prefix": m.group("pre").strip() or None,
        "suffix": (m.group("suf") or "") + (m.group("unit") or "") or None,
        "decimals": decimals,
        "decimal_separator": dec_sep,
        "thousands_separator": thou_sep,
        "space_before_suffix": bool(re.search(r"\d\s+[A-Za-z%]", t)),
        "compact": bool(re.search(r"\d\s?(k|K|m|M|bn|B|Mt|tn|T)\b", t)),
    }


# --------------------------------------------------------------------------- images


def _np():
    import numpy as np  # noqa: PLC0415

    return np


def load_rgb(path: str | Path, max_side: int = 480):
    from PIL import Image  # noqa: PLC0415

    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    im = im.convert("RGB")
    full = im.size
    if max(im.size) > max_side:
        scale = max_side / max(im.size)
        # NEAREST keeps exact colours; any smoothing filter invents in-between colours.
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.NEAREST)
    return _np().asarray(im).astype("int32"), full


def image_palette(path: str | Path, max_colors: int = 12, threshold: float = 2.0) -> list[dict]:
    """Dominant colours of an image as exact hexes with area share (0..1)."""
    np = _np()
    arr, _ = load_rgb(path)
    flat = arr.reshape(-1, 3)
    keys = (flat[:, 0] << 16) | (flat[:, 1] << 8) | flat[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    order = np.argsort(-counts)[:4000]
    total = float(counts.sum())
    weighted = {"#%06X" % int(vals[i]): float(counts[i]) / total for i in order}
    exact_cover = sum(sorted(weighted.values(), reverse=True)[:64])
    if exact_cover < 0.5:
        # Photographic or heavily compressed image: fall back to coarse bins.
        binned: dict[str, float] = defaultdict(float)
        q = (flat // 16) * 16 + 8
        k2 = (q[:, 0] << 16) | (q[:, 1] << 8) | q[:, 2]
        v2, c2 = np.unique(k2, return_counts=True)
        for v, c in zip(v2, c2):
            binned["#%06X" % int(v)] += float(c) / total
        weighted = dict(binned)
    clusters = cluster_colors(weighted, threshold)
    return [{"hex": c["hex"], "share": round(c["weight"], 4)} for c in clusters[:max_colors] if c["weight"] >= 0.0015]


def analyze_background(path: str | Path) -> dict:
    """Classify a page image background as solid, gradient or image.

    Solid: one colour dominates the outer ring.
    Gradient: colour is a smooth linear function of position after discarding the
    foreground (robust fit in sRGB, which is where CSS and OOXML interpolate).
    Stops are read at the two extreme corners along the fitted direction.
    """
    np = _np()
    arr, (fw, fh) = load_rgb(path, max_side=240)
    h, w, _ = arr.shape
    ring = max(2, round(min(h, w) * 0.06))
    mask = np.zeros((h, w), bool)
    mask[:ring, :] = mask[-ring:, :] = mask[:, :ring] = mask[:, -ring:] = True
    border = arr[mask]
    keys = (border[:, 0] << 16) | (border[:, 1] << 8) | border[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    top = int(np.argmax(counts))
    share = counts[top] / counts.sum()
    if share >= 0.6:
        return {"kind": "solid", "hex": "#%06X" % int(vals[top]), "confidence": round(float(share), 3)}

    ys, xs = np.mgrid[0:h, 0:w]
    X = np.stack([xs.ravel() / (w - 1), ys.ravel() / (h - 1), np.ones(h * w)], axis=1)
    Y = arr.reshape(-1, 3).astype(float)
    keep = np.ones(len(X), bool)
    coef = None
    for _ in range(4):
        coef, *_ = np.linalg.lstsq(X[keep], Y[keep], rcond=None)
        resid = np.abs(X @ coef - Y).sum(axis=1)
        cut = max(6.0, float(np.percentile(resid[keep], 80)))
        keep = resid <= cut
    pred = X @ coef
    resid = np.abs(pred - Y).sum(axis=1)
    inlier = resid <= 12
    inlier_share = float(inlier.mean())
    span = float(np.abs(coef[:2]).sum())
    if inlier_share >= 0.55 and span >= 12:
        # Direction of fastest change in pixel space (y down). Use the channel-summed gradient.
        # Direction of change, signed by the channel with the largest total change.
        ch = int(np.argmax(np.abs(coef[0]) + np.abs(coef[1])))
        dx, dy = float(coef[0][ch]) / fw, float(coef[1][ch]) / fh
        corners = [(0, 0), (1, 0), (0, 1), (1, 1)]
        proj = [cx * fw * dx + cy * fh * dy for cx, cy in corners]
        start, end = corners[int(np.argmin(proj))], corners[int(np.argmax(proj))]

        def at(c):
            return rgb_to_hex(*(np.array([c[0], c[1], 1.0]) @ coef))

        vx, vy = end[0] * fw - start[0] * fw, end[1] * fh - start[1] * fh
        # CSS angle: 0deg points up, 90deg points right. Use the true gradient direction, not the corner diagonal.
        gdx, gdy = dx, dy
        if (gdx * vx + gdy * vy) < 0:
            gdx, gdy = -gdx, -gdy
        angle = (math.degrees(math.atan2(gdx, -gdy))) % 360
        return {
            "kind": "gradient",
            "type": "linear",
            "css_angle_deg": round(angle),
            "stops": [{"pos": 0, "hex": at(start)}, {"pos": 0.5, "hex": at(((start[0] + end[0]) / 2, (start[1] + end[1]) / 2))}, {"pos": 1, "hex": at(end)}],
            "confidence": round(inlier_share, 3),
            "origin": "pixels",
            "note": "Estimated from pixels with a linear fit. A multi-stop or radial gradient will be approximated; look at the page image.",
        }
    pal = image_palette(path, 4)
    return {"kind": "image", "palette": pal, "confidence": round(1 - inlier_share, 3)}


def contact_sheet(images: list[Path], out: Path, cols: int = 4, thumb_w: int = 480, labels: list[str] | None = None) -> Path:
    """Grid of page thumbnails with labels, so many pages can be looked at in one image."""
    from PIL import Image, ImageDraw  # noqa: PLC0415

    thumbs = []
    for p in images:
        im = Image.open(p).convert("RGB")
        im.thumbnail((thumb_w, thumb_w * 4))
        thumbs.append(im)
    if not thumbs:
        raise ValueError("no images")
    th = max(t.height for t in thumbs)
    pad, label_h = 12, 22
    rows = math.ceil(len(thumbs) / cols)
    sheet = Image.new("RGB", (cols * (thumb_w + pad) + pad, rows * (th + label_h + pad) + pad), (238, 238, 238))
    draw = ImageDraw.Draw(sheet)
    for i, t in enumerate(thumbs):
        x = pad + (i % cols) * (thumb_w + pad)
        y = pad + (i // cols) * (th + label_h + pad)
        draw.text((x, y + 4), labels[i] if labels else images[i].stem, fill=(30, 30, 30))
        sheet.paste(t, (x, y + label_h))
        draw.rectangle([x - 1, y + label_h - 1, x + t.width, y + label_h + t.height], outline=(190, 190, 190))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return out


# --------------------------------------------------------------------------- output


def write_extraction(out_dir: Path, data: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    data = {"schema": EXTRACTION_SCHEMA, **data}
    path = out_dir / "extraction.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return path


def summarize(data: dict) -> str:
    """Short human-readable digest printed by every extractor."""
    lines = [f"source: {data['source'].get('type')} {data['source'].get('path') or data['source'].get('url') or ''}"]
    lines.append(f"pages: {len(data.get('pages', []))}")
    dec = data.get("declared", {})
    if dec.get("colors"):
        lines.append("declared colours: " + ", ".join(f"{c.get('name')}={c['hex']}" for c in dec["colors"][:16]))
    if dec.get("fonts"):
        lines.append("declared fonts: " + ", ".join(f"{f.get('role')}={f['family']}" for f in dec["fonts"][:8]))
    obs = data.get("observed", {})
    if obs.get("colors"):
        lines.append("observed colours: " + ", ".join(f"{c['hex']}({'/'.join(sorted(c.get('uses', {})))})" for c in obs["colors"][:14]))
    if obs.get("fonts"):
        lines.append("observed fonts: " + ", ".join(f"{f['family']} {f.get('weight', '')}".strip() for f in obs["fonts"][:10]))
    if obs.get("gradients"):
        lines.append("gradients: " + "; ".join(f"{g.get('css_angle_deg', '?')}deg " + "→".join(s["hex"] for s in g["stops"]) for g in obs["gradients"][:5]))
    dv = data.get("dataviz", {})
    lines.append(f"dataviz: {len(dv.get('charts', []))} charts, {len(dv.get('tables', []))} tables, {len(dv.get('big_numbers', []))} big numbers")
    for w in data.get("warnings", []):
        lines.append("warning: " + w)
    return "\n".join(lines)
