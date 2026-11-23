# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Deterministic helpers for turning an extraction into a brand. Standard library only.

  uv run brand_tools.py analyze <out>/extraction.json [--offline]
      Cluster colours, propose role candidates and surfaces, derive a type scale,
      look fonts up on Fontsource, summarise data-viz style. Writes analysis.json
      next to the extraction and prints a digest.

  uv run brand_tools.py contrast '#0F1B2D' '#F7F4EE' ['#FF5A36' ...]
      WCAG contrast of each colour against the first one (the background). --all-pairs adds every other pair.

  uv run brand_tools.py scale '#FF5A36' [--name coral]
      An 11-step tonal scale (50..950) in OKLCH that passes through the given colour.

  uv run brand_tools.py data-palette --bg '#F7F4EE' --fg '#0F1B2D' --colors '#FF5A36,#7A2CF5,#12B5A5' [--n 6] [--inverse-bg '#0F1B2D']
      Categorical, sequential and diverging data palettes plus a context colour,
      derived from brand colours, with contrast and colour-vision checks.

  uv run brand_tools.py check-data-palette --bg '#F7F4EE' --colors '#..,#..'
      Validate an existing categorical palette (for example one read from the source's charts).

  uv run brand_tools.py fonts "Helvetica Neue" "Gotham" [--offline]
      Availability on Fontsource, licence, and open alternatives for each family.

  uv run brand_tools.py check-draft brand-draft.json [--catalog catalog.json] [--workspace .]
      Structural and contrast checks on a brand draft before the specimen is rendered. Layout specs in layouts[]
      are checked against the layout catalog (`deckster layouts <deck> --json`): names, fallbacks, bindings, boxes.

  uv run brand_tools.py propose-layouts <out>/extraction.json --draft brand-draft.json [--catalog catalog.json] [--aspect-rule stretch]
      One brand layout spec per layout of a template (used or not), written into the draft's layouts[] for review.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _common as C  # noqa: E402
import _layouts as L  # noqa: E402

# Thresholds copied from the brand compiler (`deckster brand check`). If they change there, change them here.
TEXT_CONTRAST, GRAPHIC_CONTRAST = 4.5, 3.0
MIN_ADJACENT, COMFORTABLE_ADJACENT, MIN_ADJACENT_CVD = 10.0, 15.0, 8.0
MIN_DIVERGING_ENDS = 12.0
CONTEXT_RANGE = (1.4, 4.5)
CONTEXT_TARGET = 3.0  # the framework holds context data to 3:1 on every surface's chart plate
MIN_CATEGORICAL, MAX_CATEGORICAL = 3, 12

# Proprietary or system typefaces -> open alternatives on Fontsource, closest first.
# "metric" marks drop-in metric-compatible replacements (same advance widths).
ALTERNATIVES: dict[str, list[tuple[str, str]]] = {
    "helvetica": [("Inter", "neo-grotesque, taller x-height"), ("Arimo", "metric-compatible with Arial/Helvetica"), ("Hanken Grotesk", "")],
    "helvetica neue": [("Inter", "closest widely used open neo-grotesque"), ("Hanken Grotesk", ""), ("Arimo", "metric")],
    "arial": [("Arimo", "metric"), ("Inter", "")],
    "calibri": [("Carlito", "metric"), ("Open Sans", "humanist, wider")],
    "aptos": [("Inter", ""), ("Hanken Grotesk", "")],
    "cambria": [("Caladea", "metric"), ("Source Serif 4", "")],
    "times new roman": [("Tinos", "metric"), ("Source Serif 4", "")],
    "times": [("Tinos", "metric")],
    "georgia": [("Gelasio", "metric"), ("Source Serif 4", "")],
    "courier new": [("Cousine", "metric"), ("Courier Prime", "")],
    "consolas": [("Inconsolata", ""), ("JetBrains Mono", "")],
    "menlo": [("DejaVu Mono", "Menlo is derived from it"), ("JetBrains Mono", "")],
    "monaco": [("JetBrains Mono", ""), ("IBM Plex Mono", "")],
    "sf mono": [("JetBrains Mono", ""), ("IBM Plex Mono", "")],
    "sf pro": [("Inter", "designed as an open counterpart"), ("Figtree", "")],
    "sf pro display": [("Inter Tight", "tighter, for display sizes"), ("Inter", "")],
    "sf pro text": [("Inter", "")],
    "segoe ui": [("Open Sans", "humanist, similar proportions"), ("Noto Sans", "")],
    "verdana": [("DejaVu Sans", "same lineage"), ("Open Sans", "")],
    "tahoma": [("DejaVu Sans", ""), ("Noto Sans", "")],
    "trebuchet ms": [("Fira Sans", ""), ("Source Sans 3", "")],
    "century gothic": [("Questrial", ""), ("Jost", "geometric"), ("Poppins", "")],
    "futura": [("Jost", "closest open Futura interpretation"), ("League Spartan", "bolder weights"), ("Outfit", "")],
    "avenir": [("Nunito Sans", "similar proportions"), ("Mulish", ""), ("Figtree", "")],
    "avenir next": [("Nunito Sans", ""), ("Figtree", ""), ("Mulish", "")],
    "gotham": [("Montserrat", "closest open match"), ("Figtree", ""), ("Outfit", "")],
    "proxima nova": [("Montserrat", ""), ("Figtree", ""), ("Hanken Grotesk", "")],
    "circular": [("Outfit", ""), ("DM Sans", "low-contrast geometric"), ("Plus Jakarta Sans", "")],
    "graphik": [("Inter", ""), ("Hanken Grotesk", ""), ("DM Sans", "")],
    "sohne": [("Inter", ""), ("Hanken Grotesk", "closer warmth"), ("Schibsted Grotesk", "")],
    "akzidenz grotesk": [("Hanken Grotesk", ""), ("Inter", ""), ("Archivo", "")],
    "univers": [("Inter", ""), ("Archivo", "")],
    "frutiger": [("Hind", ""), ("Open Sans", ""), ("Noto Sans", "")],
    "myriad pro": [("Source Sans 3", "Adobe's open successor in spirit"), ("PT Sans", "")],
    "gill sans": [("Lato", "humanist; not a close match"), ("Cabin", "")],
    "din": [("Barlow", "DIN-like"), ("Bahnschrift", "system only"), ("Roboto Condensed", "")],
    "din next": [("Barlow", ""), ("Sofia Sans", "")],
    "ff din": [("Barlow", ""), ("Sofia Sans", "")],
    "trade gothic": [("Archivo Narrow", ""), ("Oswald", "condensed weights")],
    "franklin gothic": [("Libre Franklin", "open revival"), ("Public Sans", "")],
    "brandon grotesque": [("Josefin Sans", ""), ("Jost", "")],
    "gilroy": [("Poppins", ""), ("Outfit", ""), ("Plus Jakarta Sans", "")],
    "sofia pro": [("Sofia Sans", ""), ("Poppins", "")],
    "museo sans": [("Nunito Sans", ""), ("Figtree", "")],
    "optima": [("Marcellus", "flared; display only"), ("Lato", "")],
    "garamond": [("EB Garamond", "open revival"), ("Cormorant Garamond", "display")],
    "adobe garamond": [("EB Garamond", ""), ("Cormorant Garamond", "")],
    "baskerville": [("Libre Baskerville", "open revival"), ("Baskervville", "")],
    "caslon": [("Libre Caslon Text", "open revival")],
    "bodoni": [("Bodoni Moda", "open revival"), ("Libre Bodoni", "")],
    "didot": [("Playfair Display", "high-contrast transitional, not a true Didone"), ("Bodoni Moda", "")],
    "minion pro": [("Crimson Pro", ""), ("EB Garamond", "")],
    "palatino": [("Libertinus Serif", ""), ("EB Garamond", "")],
    "tiempos": [("Source Serif 4", ""), ("Newsreader", "")],
    "rockwell": [("Rokkitt", "open slab in the same vein"), ("Roboto Slab", "")],
    "clarendon": [("Besley", "open Clarendon")],
    "ibm plex sans": [("IBM Plex Sans", "open")],
    "gt walsheim": [("Outfit", ""), ("Urbanist", "")],
    "gt america": [("Inter", ""), ("Archivo", "")],
    "tt norms": [("Outfit", ""), ("Plus Jakarta Sans", "")],
    "aeonik": [("Hanken Grotesk", ""), ("Outfit", "")],
    "neue haas grotesk": [("Inter", ""), ("Hanken Grotesk", "")],
    "suisse intl": [("Inter", ""), ("Hanken Grotesk", "")],
    "maison neue": [("Hanken Grotesk", ""), ("Inter", "")],
    "apercu": [("DM Sans", ""), ("Space Grotesk", "quirkier")],
    "roobert": [("Outfit", ""), ("Plus Jakarta Sans", "")],
    "google sans": [("Outfit", ""), ("Figtree", "")],
    "product sans": [("Outfit", ""), ("Figtree", "")],
}
SYSTEM_FONTS = {"arial", "helvetica", "helvetica neue", "times new roman", "times", "georgia", "verdana", "tahoma", "trebuchet ms", "courier new", "calibri", "cambria",
                "consolas", "segoe ui", "sf pro", "sf pro display", "sf pro text", "sf mono", "menlo", "monaco", "aptos", "century gothic", "futura", "avenir",
                "avenir next", "gill sans", "optima", "palatino", "baskerville", "didot", "rockwell"}
GENERIC = {"serif", "sans-serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "-apple-system", "blinkmacsystemfont", "cursive", "?"}
MODULAR = {1.067: "minor second", 1.125: "major second", 1.2: "minor third", 1.25: "major third", 1.333: "perfect fourth", 1.414: "augmented fourth", 1.5: "perfect fifth", 1.618: "golden"}


# --------------------------------------------------------------------------- fonts


def _fontsource_exact(family: str, offline: bool) -> dict | None:
    if offline:
        return None
    # "SourceCodePro" is "Source Code Pro"; "sohne-var" is "sohne".
    family = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", re.sub(r"[-_ ]?(var|variable|vf)$", "", family.strip(), flags=re.IGNORECASE))
    fid = re.sub(r"[^a-z0-9]+", "-", family.lower()).strip("-")
    for url in (f"https://api.fontsource.org/v1/fonts/{fid}", f"https://api.fontsource.org/v1/fonts?family={urllib.parse.quote(family)}"):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "brand-import"})
            with urllib.request.urlopen(req, timeout=12) as r:
                data = json.loads(r.read())
            if isinstance(data, list):
                data = next((d for d in data if d.get("family", "").lower() == family.lower()), None)
            if data and data.get("id"):
                return {"id": data["id"], "family": data["family"], "license": data.get("license"), "weights": data.get("weights"),
                        "styles": data.get("styles"), "variable": data.get("variable"), "category": data.get("category"), "package": f"@fontsource{'-variable' if data.get('variable') else ''}/{data['id']}"}
        except Exception:  # noqa: BLE001
            continue
    return None


def fontsource_lookup(family: str, offline: bool) -> dict | None:
    """Look a family up on Fontsource; when the full name is unknown, try it without its trailing words, since
    exporters name static instances per text style ("Fraunces Deck Headline", "Inter Display Bold")."""
    words = family.split()
    for n in range(len(words), 0, -1):
        hit = _fontsource_exact(" ".join(words[:n]), offline)
        if hit:
            if n < len(words):
                hit["matched_as"] = " ".join(words[:n])
            return hit
        if n <= len(words) - 3:
            break
    return None


def font_report(family: str, offline: bool = False) -> dict:
    key = re.sub(r"\s+", " ", family.lower().strip())
    key = re.sub(r"[-_]?(var|variable|vf|web|pro|std|lt)$", "", key).strip() if key not in ALTERNATIVES else key
    key = key.replace("-", " ")
    out: dict = {"family": family}
    if key in GENERIC:
        out["status"] = "generic"
        out["note"] = "A generic or system stack, not a brand typeface. Look at what actually rendered."
        return out
    fs = fontsource_lookup(family, offline)
    if fs:
        out.update({"status": "open", "fontsource": fs, "note": f"On Fontsource as {fs['id']} ({fs['license']}). Use it directly."})
        return out
    alts = ALTERNATIVES.get(key) or next((v for k, v in ALTERNATIVES.items() if key.startswith(k) or k in key), None)
    out["status"] = "system" if key in SYSTEM_FONTS else "not-on-fontsource"
    if offline:
        out["status"] += " (not checked online)"
    out["note"] = ("A system font: present on the author's machine, not licensed for redistribution with a deck." if key in SYSTEM_FONTS
                   else "Not on Fontsource. Probably commercial or custom: the user must supply licensed files, or approve an alternative.")
    if alts:
        out["alternatives"] = []
        for name, why in alts:
            a = {"family": name, "why": why or None}
            fsa = fontsource_lookup(name, offline)
            if fsa:
                a["fontsource"] = fsa["id"]
                a["license"] = fsa["license"]
            out["alternatives"].append(a)
    else:
        out["alternatives"] = []
        out["note"] += " No alternative is known for this name: compare candidates visually (x-height, width, contrast, terminals) against the page images."
    return out


# --------------------------------------------------------------------------- colour scales and data palettes


def tonal_scale(hexv: str) -> dict[str, str]:
    """50..950 steps. Lightness follows a fixed ramp shifted so the input sits on its nearest step; chroma tapers at the ends."""
    L, Cc, H = C.hex_to_oklch(hexv)
    steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    target = [0.975, 0.945, 0.89, 0.82, 0.73, 0.64, 0.55, 0.46, 0.38, 0.30, 0.23]
    idx = min(range(len(steps)), key=lambda i: abs(target[i] - L))
    out = {}
    for i, (step, t) in enumerate(zip(steps, target)):
        if i == idx:
            out[str(step)] = C.norm_hex(hexv)
            continue
        # Pull the neighbours toward the anchor so the ramp stays even around it.
        l = t + (L - target[idx]) * max(0.0, 1 - abs(i - idx) / 4)
        chroma = Cc * (1 - 0.75 * abs(l - L) / max(L, 1 - L)) if Cc > 0.02 else Cc
        out[str(step)] = C.oklch_to_hex(l, max(chroma, 0), H)
    out["_anchor_step"] = str(steps[idx])
    return out


def ensure_contrast(hexv: str, bg: str, ratio: float) -> str:
    """Move lightness the smallest amount needed to reach the contrast ratio against bg."""
    if C.contrast(hexv, bg) >= ratio:
        return C.norm_hex(hexv)
    L, Cc, H = C.hex_to_oklch(hexv)
    direction = -1 if C.luminance(bg) > 0.4 else 1
    for i in range(1, 80):
        cand = C.oklch_to_hex(L + direction * 0.01 * i, Cc, H)
        if C.contrast(cand, bg) >= ratio:
            return cand
    return C.norm_hex(hexv)


def cvd_report(colors: list[str]) -> dict:
    """Smallest OKLab distance between any two colours, and between neighbours, under each colour-vision deficiency."""
    rep: dict = {}
    for kind in ("normal", "deuteranopia", "protanopia", "tritanopia"):
        sim = colors if kind == "normal" else [C.simulate_cvd(c, kind) for c in colors]
        pairs = [(C.delta_e(sim[i], sim[j]), i, j) for i in range(len(sim)) for j in range(i + 1, len(sim))]
        if not pairs:
            continue
        worst = min(pairs)
        adj = min((C.delta_e(sim[i], sim[i + 1]), i, i + 1) for i in range(len(sim) - 1))
        rep[kind] = {"min_delta_e": round(worst[0], 1), "worst_pair": [colors[worst[1]], colors[worst[2]]],
                     "min_adjacent_delta_e": round(adj[0], 1), "worst_adjacent": [colors[adj[1]], colors[adj[2]]]}
    return rep


def order_categorical(colors: list[str]) -> list[str]:
    """Keep the first colour (the brand's lead), then repeatedly take the colour farthest from the previous one,
    so neighbouring series differ as much as possible."""
    rest = list(colors[1:])
    out = [colors[0]]
    while rest:
        def gap(c: str) -> float:
            d = C.delta_e(c, out[-1])
            for kind in ("deuteranopia", "protanopia"):
                d = min(d, C.delta_e(C.simulate_cvd(c, kind), C.simulate_cvd(out[-1], kind)))
            return d

        nxt = max(rest, key=gap)
        out.append(nxt)
        rest.remove(nxt)
    return out


def data_palette(bg: str, fg: str, brand: list[str], n: int = 6, inverse_bg: str | None = None, source_series: list[str] | None = None,
                 diverging_ends: list[str] | None = None) -> dict:
    notes: list[str] = []
    chromatic = [C.norm_hex(c) for c in brand if not C.is_neutral(c, 0.04)]
    dedup: list[str] = []
    for c in (source_series or []) + chromatic:
        c = C.norm_hex(c)
        if not C.is_neutral(c, 0.04) and all(C.delta_e(c, d) > 6 for d in dedup):
            dedup.append(c)
    base = dedup[:n]
    if not base:
        base = ["#3B6FD9"]
        notes.append("No chromatic brand colour was given: started from a neutral blue. Replace it.")
    # Fill up with hues from the largest gaps on the hue wheel, at the brand's typical lightness and chroma.
    Ls, Cs = zip(*[(C.hex_to_oklch(c)[0], C.hex_to_oklch(c)[1]) for c in base])
    l_mid, c_mid = sorted(Ls)[len(Ls) // 2], sorted(Cs)[len(Cs) // 2]
    generated = []
    base = [ensure_contrast(c, bg, 3.0) for c in base]
    adjusted = {ensure_contrast(c, bg, 3.0): c for c in dedup[:n] if ensure_contrast(c, bg, 3.0) != c}
    kinds = ("deuteranopia", "protanopia", "tritanopia")

    def separation(cand: str, others: list[str]) -> float:
        worst = min(C.delta_e(cand, o) for o in others)
        for kind in kinds:
            sc = C.simulate_cvd(cand, kind)
            worst = min(worst, min(C.delta_e(sc, C.simulate_cvd(o, kind)) for o in others))
        return worst

    chroma = min(max(c_mid, 0.10), 0.17)
    while len(base) < n:
        # Try a grid of hues and lightnesses; keep the candidate that stays farthest from every existing
        # colour under normal vision and all three simulated deficiencies. Lightness variety is what
        # keeps series apart when hue is lost.
        best, best_score = None, -1.0
        for hue in range(0, 360, 10):
            for light_ in (0.45, 0.52, 0.60, 0.68, 0.76, 0.84):
                cand = C.oklch_to_hex(light_, chroma, hue)
                if C.contrast(cand, bg) < 3.0:
                    continue
                score = separation(cand, base)
                if score > best_score:
                    best, best_score = cand, score
        if best is None:
            break
        base.append(best)
        generated.append(best)
    if generated:
        notes.append(f"{len(generated)} of {n} categorical colours were generated to fill hue gaps ({', '.join(generated)}); the rest come from the brand. Generated hues are the first thing to drop if fewer series are needed.")
    # Brand colours first (they are used most), generated fill-ins after them.
    brand_part = [c for c in base if c not in generated]
    n_src = len([c for c in (source_series or []) if not C.is_neutral(c, 0.04)][:n])
    # Series colours seen in the source keep their order. Other brand colours follow, each as far as possible from its neighbour.
    ordered = brand_part[:n_src] if n_src else order_categorical(brand_part)
    if n_src and len(brand_part) > n_src:
        ordered += order_categorical([ordered[-1], *brand_part[n_src:]])[1:]
    if generated:
        ordered += order_categorical([ordered[-1], *generated])[1:]
    categorical = []
    for c in ordered:
        adj = c
        entry = {"hex": adj, "origin": "generated" if c in generated else "brand", "contrast_on_bg": round(C.contrast(adj, bg), 2)}
        if c in adjusted:
            entry["adjusted_from"] = adjusted[c]
        if inverse_bg:
            entry["contrast_on_inverse"] = round(C.contrast(adj, inverse_bg), 2)
            if entry["contrast_on_inverse"] < 3:
                entry["inverse_variant"] = ensure_contrast(adj, inverse_bg, 3.0)
        categorical.append(entry)
    if any("adjusted_from" in e for e in categorical):
        notes.append("Some brand colours were darkened or lightened to reach 3:1 against the background (WCAG 1.4.11 for graphical marks). Keep the original hex for fills behind text labels only if marks stay distinguishable.")
    cat_hex = [e["hex"] for e in categorical]
    cvd = cvd_report(cat_hex)
    weak = [k for k, v in cvd.items() if v["min_adjacent_delta_e"] < (MIN_ADJACENT if k == "normal" else MIN_ADJACENT_CVD)]
    if weak:
        notes.append("Neighbouring series get close under " + ", ".join(weak) + " (the compiler fails neighbours under ΔE 10 in normal vision or 8 under a simulated deficiency). Reorder, stagger lightness, or rely on direct labels and one highlight instead of a legend.")
    safe_n = len(cat_hex)
    for k in range(len(cat_hex), 1, -1):
        sub = cvd_report(cat_hex[:k])
        if all(v["min_delta_e"] >= 8 for v in sub.values()):
            safe_n = k
            break
        safe_n = k - 1

    # Context: a quiet neutral for de-emphasised series, tinted toward the background's hue.
    bL, bC, bH = C.hex_to_oklch(bg)
    light = C.luminance(bg) > 0.4
    context = None
    for i in range(1, 70):
        cand = C.oklch_to_hex(bL + (-0.01 if light else 0.01) * i, min(max(bC, 0.008), 0.02), bH)
        if C.contrast(cand, bg) >= CONTEXT_TARGET + 0.05:
            context = cand
            break
    context = context or C.oklch_to_hex(0.75, 0.01, bH)

    lead = cat_hex[0]
    lL, lC, lH = C.hex_to_oklch(lead)
    seq_L = [0.95, 0.88, 0.79, 0.69, 0.58, 0.47, 0.36] if light else [0.30, 0.39, 0.48, 0.58, 0.68, 0.79, 0.90]
    sequential = [C.oklch_to_hex(l, lC * (0.25 + 0.75 * (1 - abs(l - 0.6) / 0.4)) if 0.2 <= l <= 1 else lC * 0.3, lH) for l in seq_L]
    # Diverging: lead hue against the brand hue farthest from it; fall back to the complement.
    # Opposite end: a brand colour at least 60 degrees of hue away that stays distinct from the lead under
    # red-green deficiency; the pair that survives best wins.
    def end_gap(c: str) -> float:
        return min(C.delta_e(C.simulate_cvd(c, k), C.simulate_cvd(lead, k)) for k in ("deuteranopia", "protanopia"))

    others = [(end_gap(c), c) for c in cat_hex[1:] if c not in generated and abs(((C.hex_to_oklch(c)[2] - lH + 180) % 360) - 180) >= 60]
    far = max(others, default=(0, None))
    div_lead = lead
    if diverging_ends and len(diverging_ends) == 2:
        other, div_lead = C.norm_hex(diverging_ends[0]), C.norm_hex(diverging_ends[1])
        lL, lC, lH = C.hex_to_oklch(div_lead)
    elif far[0] >= 12:
        other = far[1]
    else:
        other = C.oklch_to_hex(lL, max(lC, 0.12), (lH + 180) % 360)
        notes.append("No brand colour sits far enough from the lead hue for a diverging scale, so the opposite end is the lead's complement. Check that it does not read as off-brand.")
    oL, oC, oH = C.hex_to_oklch(other)
    mid = C.oklch_to_hex(0.94 if light else 0.32, 0.006, bH)
    arm = [0.50, 0.66, 0.82] if light else [0.78, 0.62, 0.46]
    diverging = [C.oklch_to_hex(l, oC * (1.0 if i == 0 else 0.7 if i == 1 else 0.4), oH) for i, l in enumerate(arm)] + [mid] + \
                [C.oklch_to_hex(l, lC * (0.4 if i == 0 else 0.7 if i == 1 else 1.0), lH) for i, l in enumerate(reversed(arm))]
    ends = cvd_report([diverging[0], diverging[-1]])
    if any(v["min_delta_e"] < 12 for v in ends.values()):
        notes.append("The two ends of the diverging scale are hard to tell apart for some colour-vision deficiencies. Prefer a blue-orange pair, or make one arm clearly darker.")
    seq_ok = all(C.hex_to_oklch(a)[0] > C.hex_to_oklch(b)[0] for a, b in zip(sequential, sequential[1:])) if light else \
        all(C.hex_to_oklch(a)[0] < C.hex_to_oklch(b)[0] for a, b in zip(sequential, sequential[1:]))
    return {
        "background": C.norm_hex(bg), "categorical": categorical, "categorical_cvd": cvd, "categorical_safe_count": max(safe_n, 1),
        "categorical_safe_count_rule": "The largest k such that every pair among the first k colours keeps ΔE of 8 or more under normal vision and all three simulated deficiencies. Charts with more series than this should highlight one series against the context colour.",
        "highlight": lead, "context": {"hex": context, "contrast_on_bg": round(C.contrast(context, bg), 2),
                                       "note": "For de-emphasised series next to one highlighted series. Held to 3:1 (thin lines and dots must stay visible) and kept under 4.5:1 so it never reads as strongly as text; the framework moves it in lightness per surface."},
        "sequential": {"hex": sequential, "monotonic_lightness": seq_ok, "hue_from": lead},
        "diverging": {"hex": diverging, "midpoint": mid, "ends": [other, div_lead], "ends_cvd": ends},
        "notes": notes,
    }


# --------------------------------------------------------------------------- analyze


def analyze(path: Path, offline: bool) -> dict:
    ex = json.loads(path.read_text())
    src = ex["source"]["type"]
    obs, dec = ex.get("observed", {}), ex.get("declared", {})
    pages = ex.get("pages", [])
    n_pages = max(len(pages), 1)
    declared_by_hex = defaultdict(list)
    for d in dec.get("colors", []):
        declared_by_hex[d["hex"]].append(d["name"])

    # ---- palette
    weights = {c["hex"]: c["weight"] for c in obs.get("colors", [])}
    info = {c["hex"]: c for c in obs.get("colors", [])}
    clusters = C.cluster_colors(weights, 2.5)
    palette = []
    for cl in clusters[:28]:
        uses: Counter = Counter()
        pg: set = set()
        for m in cl["members"]:
            uses.update(info[m].get("uses", {}))
            pg |= set(info[m].get("pages", []))
        L, Cc, H = C.hex_to_oklch(cl["hex"])
        names = sorted({n for m in cl["members"] for n in declared_by_hex.get(m, [])})
        palette.append({"hex": cl["hex"], "weight": round(cl["weight"], 4), "page_share": round(len(pg) / n_pages, 2), "uses": {k: round(v, 3) for k, v in uses.items()},
                        "neutral": Cc < 0.035, "oklch": [round(L, 3), round(Cc, 3), round(H)], "declared_as": names,
                        "merged": [m for m in cl["members"] if m != cl["hex"]][:5], "hard_coded": info[cl["hex"]].get("hard_coded_uses"), "in_theme": info[cl["hex"]].get("in_theme")})
    declared_unused = [d for d in dec.get("colors", []) if d.get("used") is False]

    # ---- surfaces: group pages by background, with the text colours that sit on them
    surfaces: dict[str, dict] = {}
    if src == "web":
        for pr in obs.get("color_pairs", []):
            key = pr["background"] if pr["background"].startswith("#") else f"{pr['background']}:{(pr.get('background_css') or '')[:60]}"
            s = surfaces.setdefault(key, {"background": pr["background"], "background_css": pr.get("background_css"), "chars": 0, "text": Counter(), "pages": []})
            s["chars"] += pr["chars"]
            s["text"][pr["foreground"]] += pr["chars"]
    else:
        for pg in pages:
            bg = pg.get("background", {})
            px = bg.get("pixels") or {}
            kind = bg.get("kind") or px.get("kind")
            if kind == "solid":
                key = bg.get("hex") or px.get("hex")
            elif kind == "gradient":
                stops = bg.get("stops") or px.get("stops") or []
                key = "gradient:" + "→".join(s.get("hex") or "?" for s in stops)
            elif px.get("kind") == "solid":
                key = px["hex"]
            else:
                key = kind or "unknown"
            if not key:
                continue
            near = next((k for k in surfaces if k.startswith("#") and key.startswith("#") and C.delta_e(k, key) < 2.5), None)
            s = surfaces.setdefault(near or key, {"background": near or key, "chars": 0, "text": Counter(), "pages": []})
            s["pages"].append(pg["index"])
            for tb in pg.get("text_blocks", []):
                if tb.get("color"):
                    s["text"][tb["color"]] += len(tb.get("text", ""))
                    s["chars"] += len(tb.get("text", ""))
    surfaces_out = []
    for key, s in sorted(surfaces.items(), key=lambda kv: -(len(kv[1]["pages"]) or kv[1]["chars"])):
        texts = []
        for fgc, chars in s["text"].most_common(6):
            t = {"hex": fgc, "chars": chars}
            if key.startswith("#"):
                t["contrast"] = round(C.contrast(fgc, key), 2)
                t["passes"] = "AA" if t["contrast"] >= 4.5 else "AA-large" if t["contrast"] >= 3 else "fail"
            texts.append(t)
        role = None
        if key.startswith("#"):
            lum = C.luminance(key)
            role = "dark" if lum < 0.18 else "light" if lum > 0.6 else "mid"
            if not C.is_neutral(key, 0.08):
                role += "-chromatic"
        surfaces_out.append({"background": s["background"], "background_css": s.get("background_css"), "kind": "solid" if key.startswith("#") else key.split(":")[0],
                             "tone": role, "pages": s["pages"], "page_share": round(len(s["pages"]) / n_pages, 2) if s["pages"] else None, "text_colors": texts})

    # ---- role candidates
    solid = [s for s in surfaces_out if s["kind"] == "solid"]
    page_bg = ((obs.get("components") or {}).get("body") or {}).get("background")
    if src == "web" and page_bg:
        # On a website the page background is the default surface even when cards hold more text.
        solid.sort(key=lambda s: s["background"] != page_bg)
    default = solid[0] if solid else None
    roles: dict = {}
    if default:
        roles["bg"] = {"hex": default["background"], "why": f"background of {len(default['pages']) or 'most'} pages" if default["pages"] else "most text sits on it"}
        if default["text_colors"]:
            top_chars = default["text_colors"][0]["chars"]
            sizeable = [t for t in default["text_colors"] if t["chars"] >= 0.2 * top_chars]
            body = max(sizeable, key=lambda t: t.get("contrast", 0))
            roles["fg"] = {"hex": body["hex"], "why": "highest-contrast colour among the main text colours on the default background", "contrast_on_bg": body.get("contrast")}
            all_chars = sum(t["chars"] for t in default["text_colors"]) or 1
            muted = [t for t in default["text_colors"] if t["hex"] != roles["fg"]["hex"] and C.hex_to_oklch(t["hex"])[1] < 0.06 and t["chars"] / all_chars >= 0.08
                     and 3 <= t.get("contrast", 0) < roles["fg"].get("contrast_on_bg", 21)]
            if muted:
                roles["muted"] = {"hex": muted[0]["hex"], "why": "second neutral text colour on the default background", "contrast_on_bg": muted[0].get("contrast")}
        opposite = [s for s in solid[1:] if s["tone"] and default["tone"] and s["tone"].split("-")[0] != default["tone"].split("-")[0] and s["tone"].split("-")[0] != "mid"]
        if opposite:
            roles["inverse_bg"] = {"hex": opposite[0]["background"], "why": f"opposite-tone background on pages {opposite[0]['pages'][:6]}" if opposite[0]["pages"] else "opposite-tone section background"}
    taken = {v["hex"] for k, v in roles.items() if isinstance(v, dict) and "hex" in v}

    def ink_like(p: dict) -> bool:
        # Very dark or very light tinted colours are inks and papers, not accents.
        return (p["oklch"][0] < 0.42 and p["oklch"][1] < 0.09) or (p["oklch"][0] > 0.93 and p["oklch"][1] < 0.06)

    chroma = [p for p in palette if not p["neutral"] and p["hex"] not in taken and not ink_like(p)]
    dark_tones = [p for p in palette if not p["neutral"] and p["hex"] not in taken and ink_like(p) and p["oklch"][0] < 0.5]
    if dark_tones:
        roles["dark_brand_tones"] = [{"hex": p["hex"], "declared_as": p["declared_as"], "uses": p["uses"], "page_share": p["page_share"],
                                      "note": "dark tinted colour: a heading or secondary-surface colour rather than an accent"} for p in dark_tones[:3]]

    dvx = ex.get("dataviz", {})
    lead_series = {(c["hex"] if isinstance(c, dict) else c) for ch in dvx.get("charts", []) for c in ch.get("series_colors", [])[:1]}
    highlight_series = {c["hex"] for ch in dvx.get("charts", []) if ch.get("highlight_pattern") for c in ch.get("series_colors", []) if isinstance(c, dict) and not C.is_neutral(c["hex"], 0.035)}
    stat_colors = Counter(b["color"] for b in dvx.get("big_numbers", []) if b.get("color"))
    grad_stops = {st.get("hex") for g in obs.get("gradients", []) for st in g.get("stops", [])}

    def accent_score(p: dict) -> float:
        # Emphasis matters more than volume: the accent is where the eye is sent (big numbers, the lead or
        # highlighted chart series, gradient ends, buttons), not the colour with the most characters.
        u = p["uses"]
        score = u.get("fill", 0) * 2 + u.get("text", 0) / 400 + u.get("stroke", 0) * 0.05 + p["page_share"] * 0.5 + u.get("area", 0)
        score += 0.4 if any(re.search(r"accent1$|primary|brand|main", n, re.I) for n in p["declared_as"]) else 0.1 if p["declared_as"] else 0
        score += 0.4 if p["hex"] in lead_series or p["hex"] in highlight_series else 0
        score += 0.4 if stat_colors and p["hex"] == stat_colors.most_common(1)[0][0] else 0
        score += 0.2 if p["hex"] in grad_stops else 0
        return score

    ranked = sorted(chroma, key=accent_score, reverse=True)
    if ranked:
        roles["accent"] = {"hex": ranked[0]["hex"], "why": "chromatic colour with the most fills, emphasised text and page coverage", "declared_as": ranked[0]["declared_as"]}
        if default:
            cr = C.contrast(ranked[0]["hex"], default["background"])
            roles["accent"]["contrast_on_bg"] = round(cr, 2)
            wb = max(("#FFFFFF", "#000000"), key=lambda t: C.contrast(t, ranked[0]["hex"]))
            roles["accent"]["text_on_accent"] = {"hex": wb, "contrast": round(C.contrast(wb, ranked[0]["hex"]), 2)}
        roles["accent_alternates"] = [{"hex": p["hex"], "declared_as": p["declared_as"], "page_share": p["page_share"], "uses": p["uses"]} for p in ranked[1:6]]
    border = [p for p in palette if p["uses"].get("stroke") and default and C.contrast(p["hex"], default["background"]) < 2.2 and p["hex"] != default["background"]]
    if border:
        roles["border"] = {"hex": border[0]["hex"], "why": "most used low-contrast stroke"}
    off_theme = [p for p in palette if p.get("in_theme") is False and (p.get("hard_coded") or 0) >= 3 and not p["neutral"]]

    # ---- type scale
    styles = obs.get("text_styles", [])
    size_key = "size_canvas_px" if styles and "size_canvas_px" in styles[0] else "size_px"
    by_size: dict[float, dict] = {}
    for st in styles:
        size = st.get(size_key)
        if not size:
            continue
        near = next((k for k in by_size if abs(k - size) / k < 0.06), None)
        e = by_size.setdefault(near or size, {"size": near or size, "chars": 0, "families": Counter(), "weights": Counter(), "colors": Counter(), "samples": [], "pages": set(), "upper": 0})
        e["chars"] += st["chars"]
        e["families"][st["family"]] += st["chars"]
        e["weights"][st.get("weight") or (700 if st.get("bold") else 400)] += st["chars"]
        e["colors"][st["color"]] += st["chars"]
        e["pages"] |= set(st.get("pages", []))
        e["upper"] += st["chars"] if st.get("uppercase") or st.get("text_transform") == "uppercase" or st.get("caps") == "all" else 0
        if len(e["samples"]) < 2:
            e["samples"].append(st["sample"][:40])
    total_chars = sum(e["chars"] for e in by_size.values()) or 1
    steps = sorted((e for e in by_size.values() if e["chars"] / total_chars >= 0.01 or e["size"] >= 60), key=lambda e: -e["size"])
    body = max(by_size.values(), key=lambda e: e["chars"])["size"] if by_size else None
    scale = []
    for e in steps:
        scale.append({"size": e["size"], "unit": "canvas px (1080 high)" if size_key == "size_canvas_px" else "css px", "share": round(e["chars"] / total_chars, 3),
                      "family": e["families"].most_common(1)[0][0], "weight": e["weights"].most_common(1)[0][0], "color": e["colors"].most_common(1)[0][0],
                      "uppercase": e["upper"] > e["chars"] / 2, "pages": len(e["pages"]), "samples": e["samples"], "ratio_to_body": round(e["size"] / body, 3) if body else None})
    ratios = [round(a["size"] / b["size"], 3) for a, b in zip(scale, scale[1:]) if b["size"]]
    best_ratio = None
    real_steps = sorted(r for r in ratios if r >= 1.12)
    if real_steps:
        median = real_steps[len(real_steps) // 2]
        best_ratio = min(MODULAR, key=lambda m: abs(math.log(m) - math.log(median)))
    type_out = {"unit": size_key, "body_size": body, "steps": scale, "step_ratios": ratios,
                "nearest_modular_ratio": {"ratio": best_ratio, "name": MODULAR.get(best_ratio)} if best_ratio else None,
                "note": ("Web sizes are for a scrolling page. Keep the ratios and roles; set absolute slide sizes from the deck canvas (body around 28-36 px on 1920x1080)." if src == "web"
                         else "Sizes are already scaled to a 1080-high canvas. Snap near-duplicates to one step and keep 5 to 8 steps.")}

    # ---- fonts
    fonts = []
    seen = set()
    for f in obs.get("fonts", []):
        fam = f["family"]
        if fam.lower() in seen:
            continue
        seen.add(fam.lower())
        rep = font_report(fam, offline)
        rep.update({"share": f.get("share"), "subset": f.get("subset"), "theme_role": f.get("theme_role"), "hosts": f.get("hosts"),
                    "licence_evidence": f.get("licence_evidence") or None, "weights_seen": sorted({w for o in obs.get("fonts", []) if o["family"] == fam for w in ([o["weight"]] if o.get("weight") else list((o.get("weights_used") or {}).keys()))})})
        mono = bool(re.search(r"mono|code|courier|consol|menlo", fam, re.I))
        rep["role_guess"] = "mono" if mono else None
        fonts.append(rep)
    non_mono = [f for f in fonts if not f["role_guess"] and (f.get("share") or 0) > 0.03]
    if scale and non_mono:
        display_family = scale[0]["family"]
        body_family = next((s["family"] for s in scale if s["size"] == body), non_mono[0]["family"])
        for f in fonts:
            if f["role_guess"]:
                continue
            f["role_guess"] = "display+body" if f["family"] == display_family == body_family else "display" if f["family"] == display_family else "body" if f["family"] == body_family else "stray"
    for f in fonts:
        if f["role_guess"] == "stray" and (f.get("share") or 0) < 0.1:
            f["note"] = (f.get("note") or "") + " Used for under 10% of the text and not in a consistent role: probably pasted content, not part of the brand."

    # ---- dataviz
    dv = ex.get("dataviz", {})
    series: list[str] = []
    for ch in dv.get("charts", []):
        for c in ch.get("series_colors", []):
            hx = c["hex"] if isinstance(c, dict) else c
            if hx and hx not in series:
                series.append(hx)
    chart_summary = None
    if dv.get("charts"):
        grids = Counter()
        for ch in dv["charts"]:
            for ax in ch.get("axes", []):
                g = ax.get("gridlines")
                if g:
                    grids[(g.get("color"), g.get("width_pt"), g.get("dash"))] += 1
            g = ch.get("gridlines")
            if isinstance(g, dict) and g.get("color"):
                grids[(g["color"], g.get("thickness_pt"), "dashed" if g.get("dashed_guess") else "solid")] += 1
            elif isinstance(g, list):
                for gg in g:
                    grids[(gg["color"], gg.get("width_px"), gg.get("dash"))] += gg.get("count", 1)
        neutral_series = [s for s in series if C.is_neutral(s, 0.035)]
        chart_summary = {
            "count": len(dv["charts"]), "kinds": dict(Counter(ch.get("kind") or ch.get("kind_guess") for ch in dv["charts"])),
            "series_colors_in_order": series, "context_color_candidates": neutral_series,
            "highlight_pattern_seen": any(ch.get("highlight_pattern") for ch in dv["charts"]) or bool(neutral_series and len(series) - len(neutral_series) >= 1),
            "gridlines": [{"color": k[0], "width": k[1], "dash": k[2], "count": v} for k, v in grids.most_common(3)],
            "legends": Counter("legend" if ch.get("legend") or ch.get("has_legend_guess") else "no-legend" for ch in dv["charts"]),
            "min_confidence": min(ch.get("confidence", 1) for ch in dv["charts"]),
        }
        if default and len([s for s in series if not C.is_neutral(s, 0.035)]) >= 2:
            chart_summary["source_palette_check"] = cvd_report([s for s in series if not C.is_neutral(s, 0.035)])
            chart_summary["source_palette_contrast_on_bg"] = {s: round(C.contrast(s, default["background"]), 2) for s in series}
    nums = [b.get("format") for b in dv.get("big_numbers", []) if b.get("format")]
    for ch in dv.get("charts", []):
        nums += ch.get("number_formats", [])
    number_summary = None
    if nums:
        number_summary = {"suffixes": dict(Counter(nf.get("suffix") for nf in nums if nf.get("suffix")).most_common(8)),
                          "decimal_separator": Counter(nf["decimal_separator"] for nf in nums if nf.get("decimal_separator")).most_common(1),
                          "thousands_separator": Counter(nf["thousands_separator"] for nf in nums if nf.get("thousands_separator")).most_common(1),
                          "max_decimals": max(nf.get("decimals", 0) for nf in nums), "compact_notation_seen": any(nf.get("compact") for nf in nums),
                          "space_before_unit_seen": any(nf.get("space_before_suffix") for nf in nums)}
    ooxml_formats = sorted({f for ch in dv.get("charts", []) for f in ([p.get("data_labels", {}).get("number_format") for p in ch.get("plots", []) if p.get("data_labels")] +
                                                                    [a.get("number_format") for a in ch.get("axes", [])]) if f})
    big = dv.get("big_numbers", [])
    stat_style = None
    if big:
        sk = "size_canvas_px" if "size_canvas_px" in big[0] else "size_px"
        stat_style = {"count": len(big), "family": Counter(b["family"] for b in big).most_common(1)[0][0], "size": Counter(b.get(sk) for b in big).most_common(1)[0][0], "size_unit": sk,
                      "colors": [c for c, _ in Counter(b["color"] for b in big).most_common(4)], "one_color_per_stat": len({b["color"] for b in big}) > 1,
                      "label": next((b["label"] for b in big if b.get("label")), None), "examples": [b["text"] for b in big[:6]]}

    hints = Counter(h for pg in pages for h in pg.get("layout_hints", []))
    # Every layout, used or not: a template has layouts no slide uses, and they are brand layouts too.
    layouts_all = [{"key": l.get("key"), "name": l.get("name") or "", "type": l.get("type"), "master": l.get("master_index"), "slides": l.get("used_by", []), "unused": not l.get("used_by"),
                    "placeholders": [p["type"] for p in l.get("placeholders", []) if p["type"] not in ("sldNum", "dt", "ftr")],
                    "has_art": bool((l.get("art") or {}).get("has_art")), "background": (l.get("art") or {}).get("background"), "fixed_text": [t["text"] for t in l.get("fixed_text", [])][:4]}
                   for l in ex.get("layouts", [])]
    layouts_used = [l for l in layouts_all if not l["unused"]]

    out = {
        "analysis": "brand-analysis/1", "source_type": src,
        "palette": palette, "declared_but_unused": declared_unused, "off_theme_but_frequent": off_theme,
        "surfaces": surfaces_out, "role_candidates": roles,
        "gradients": obs.get("gradients", []),
        "type": type_out, "fonts": fonts,
        "shapes": obs.get("shapes"), "motion": obs.get("motion"),
        "dataviz": {"charts": chart_summary, "numbers": number_summary, "ooxml_number_formats": ooxml_formats, "stat_style": stat_style,
                    "tables": [{k: t.get(k) for k in ("page", "rows", "cols", "header", "body", "banded_guess", "style_flags")} for t in dv.get("tables", [])][:4]},
        "layout": {"hint_counts": dict(hints), "source_layouts_used": layouts_used, "source_layouts": layouts_all,
                   "source_generator": (ex.get("source") or {}).get("generator"),
                   "logo_candidates": [a for a in (ex.get("assets", {}).get("chrome") or ex.get("assets", {}).get("logos") or ex.get("assets", {}).get("images") or [])
                                       if a.get("logo_candidate_score", a.get("score", 0)) >= 0.5][:4]},
        "warnings": ex.get("warnings", []),
    }
    return out


def digest(a: dict) -> str:
    L = []
    r = a["role_candidates"]
    L.append("ROLE CANDIDATES (verify against the page images; these are proposals, not decisions)")
    for k in ("bg", "fg", "muted", "accent", "border", "inverse_bg"):
        if k in r:
            extra = f" contrast {r[k]['contrast_on_bg']}" if r[k].get("contrast_on_bg") else ""
            decl = f" [{', '.join(r[k]['declared_as'])}]" if r[k].get("declared_as") else ""
            L.append(f"  {k:<11} {r[k]['hex']}{decl}{extra}  ({r[k]['why']})")
    if r.get("accent", {}).get("text_on_accent"):
        t = r["accent"]["text_on_accent"]
        L.append(f"  text on accent: best is {t['hex']} at {t['contrast']}:1" + ("  <-- below 4.5: small text on the accent fails AA" if t["contrast"] < 4.5 else ""))
    grad_only = sorted({st.get("hex") for g in a["gradients"] for st in g.get("stops", []) if st.get("hex")} - {p["hex"] for p in a["palette"]})
    if grad_only:
        L.append("  only inside gradients: " + ", ".join(grad_only))
    for p in r.get("dark_brand_tones", []):
        L.append(f"  dark tone   {p['hex']}{'[' + ','.join(p['declared_as']) + ']' if p['declared_as'] else ''}  ({p['note']}; uses {p['uses']})")
    if r.get("accent_alternates"):
        L.append("  other chromatic: " + ", ".join(f"{p['hex']}{'[' + ','.join(p['declared_as']) + ']' if p['declared_as'] else ''}" for p in r["accent_alternates"]))
    if a["off_theme_but_frequent"]:
        L.append("  off-theme but used repeatedly: " + ", ".join(f"{p['hex']} ({p['hard_coded']} hard-coded uses on {int(p['page_share'] * 100)}% of pages)" for p in a["off_theme_but_frequent"]))
    if a["declared_but_unused"]:
        L.append("  declared but never used: " + ", ".join(f"{d['name']}={d['hex']}" for d in a["declared_but_unused"][:10]))
    L.append("SURFACES")
    for s in a["surfaces"][:6]:
        txt = ", ".join(f"{t['hex']}" + (f" {t['contrast']}:1 {t['passes']}" if "contrast" in t else "") for t in s["text_colors"][:4])
        L.append(f"  {s['background']:<34} {s.get('tone') or s['kind']:<16} pages {s['pages'][:8] if s['pages'] else '-'}  text: {txt}")
    if a["gradients"]:
        L.append("GRADIENTS")
        for g in a["gradients"][:4]:
            L.append(f"  {g.get('type')} {g.get('css_angle_deg')}deg " + " → ".join(f"{s.get('hex')}@{s.get('pos')}" for s in g.get("stops", [])) + f"  [{g.get('origin')}]")
    t = a["type"]
    L.append(f"TYPE SCALE ({t['unit']}; body = {t['body_size']})")
    for s in t["steps"][:10]:
        L.append(f"  {s['size']:>6}  {s['family']} {s['weight']}{' UPPER' if s['uppercase'] else ''}  {int(s['share'] * 100):>2}% of text  x{s['ratio_to_body']}  e.g. {s['samples'][0]!r}")
    if t["nearest_modular_ratio"]:
        L.append(f"  step ratios {t['step_ratios']}; nearest modular ratio {t['nearest_modular_ratio']['ratio']} ({t['nearest_modular_ratio']['name']})")
    L.append("FONTS")
    for f in a["fonts"]:
        alt = ""
        if f.get("alternatives"):
            alt = "  alternatives: " + ", ".join(x["family"] + (f" ({x['why']})" if x.get("why") else "") for x in f["alternatives"][:3])
        L.append(f"  {f['family']:<22} {f.get('role_guess') or '':<12} {f['status']:<18} share {f.get('share')}{'  SUBSET' if f.get('subset') else ''}{alt}")
    dv = a["dataviz"]
    if dv["charts"]:
        c = dv["charts"]
        L.append(f"CHARTS: {c['count']} {c['kinds']}; series colours {c['series_colors_in_order']}; context candidates {c['context_color_candidates']}; gridlines {c['gridlines'][:1]}; {dict(c['legends'])}; min confidence {c['min_confidence']}")
    else:
        L.append("CHARTS: none found in the source. Derive data palettes with `brand_tools.py data-palette`.")
    if dv["stat_style"]:
        s = dv["stat_style"]
        L.append(f"BIG NUMBERS: {s['count']} in {s['family']} at {s['size']} {s['size_unit']}, colours {s['colors']}, e.g. {s['examples'][:4]}")
    if dv["numbers"]:
        L.append(f"NUMBER FORMAT: {dv['numbers']}" + (f"; chart format codes {dv['ooxml_number_formats']}" if dv["ooxml_number_formats"] else ""))
    lay = a["layout"]
    if lay["source_layouts_used"]:
        L.append("SOURCE LAYOUTS USED: " + ", ".join(f"{l['name']}×{len(l['slides'])}" for l in lay["source_layouts_used"]))
    if lay.get("source_layouts"):
        unused = [l for l in lay["source_layouts"] if l["unused"]]
        L.append(f"TEMPLATE LAYOUTS: {len(lay['source_layouts'])} ({len(unused)} unused), {sum(1 for l in lay['source_layouts'] if l['has_art'])} with art"
                 + ("; made by the deckster export: none are imported" if (lay.get("source_generator") or {}).get("deckster") else "; `brand_tools.py propose-layouts` turns them into brand layouts"))
        for l in lay["source_layouts"][:40]:
            L.append(f"  {l['key'] or '-':<20} {(l['name'] or '')[:34]:<34} {l['type'] or '-':<10} {','.join(l['placeholders']) or 'no placeholders'}{'  unused' if l['unused'] else ''}{'  art' if l['has_art'] else ''}")
    if lay["hint_counts"]:
        L.append(f"LAYOUT HINTS: {lay['hint_counts']}")
    for w in a["warnings"]:
        L.append("WARNING: " + w)
    return "\n".join(L)


# --------------------------------------------------------------------------- draft checks


def check_draft(path: Path, catalog_path: Path | None = None, workspace: Path | None = None) -> tuple[list[str], list[str]]:
    """A fast pre-check that mirrors the brand compiler's rules (`deckster brand check`). The compiler
    itself (`deckster brand check <name>` on the emitted brand.ts) is the authority."""
    d = json.loads(path.read_text())
    errors, warns = [], []
    color = d.get("color", {})
    surfaces = color.get("surfaces", {})
    grads = d.get("gradients", {})
    norm = lambda r: {"accent_fg": "accent-fg"}.get(r, r)  # noqa: E731
    waivers = [(norm(w.get("color")), norm(w.get("on", "bg")), w.get("surface")) for w in d.get("waivers", []) + color.get("waivers", [])]
    waivers += [(norm(a.get("role")), "accent" if norm(a.get("role")) == "accent-fg" else "bg", a.get("surface")) for a in d.get("accepted_contrast", [])]
    for need in ("bg", "fg", "muted", "accent", "border"):
        if need not in color.get("roles", {}):
            errors.append(f"color.roles.{need} is missing")
    if "default" not in surfaces:
        errors.append("color.surfaces.default is missing")
    base_roles = {norm(k): v for k, v in color.get("roles", {}).items() if isinstance(v, str)}
    # (colour, on, minimum, waivable to 3:1): the compiler's ROLE_PAIRS, minus roles the draft may leave to the emitter.
    pairs = (("fg", "bg", TEXT_CONTRAST, True), ("heading", "bg", GRAPHIC_CONTRAST, False), ("muted", "bg", TEXT_CONTRAST, True),
             ("fg", "surface", TEXT_CONTRAST, True), ("muted", "surface", TEXT_CONTRAST, True),
             ("accent-fg", "accent", TEXT_CONTRAST, True), ("accent", "bg", GRAPHIC_CONTRAST, False))
    surface_backs: dict[str, list[str]] = {}
    for name, s in surfaces.items():
        own = {norm(k): v for k, v in s.items() if isinstance(v, str)}
        # The default surface inherits the base roles. Other surfaces are checked on what they state:
        # emit_brand.py fills their gaps with colours that fit their own background.
        merged = {**base_roles, **own} if name == "default" else own
        bg = merged.get("bg")
        if not bg:
            errors.append(f"surface {name}: no bg")
            continue
        if not bg.startswith("#"):
            g = grads.get(bg.removeprefix("gradient:"))
            if not g:
                errors.append(f"surface {name}: bg refers to unknown gradient {bg!r}")
                continue
            backs = [st["color"] for st in g.get("stops", [])] or [pt["color"] for pt in g.get("points", [])]
        else:
            backs = [bg]
        surface_backs[name] = backs
        for col, on, minimum, waivable in pairs:
            if col not in merged or not str(merged[col]).startswith("#"):
                continue
            targets = backs if on == "bg" else ([merged[on]] if str(merged.get(on, "")).startswith("#") else [])
            if not targets:
                continue
            worst = min(C.contrast(merged[col], b) for b in targets)
            if worst >= minimum:
                continue
            where = "the gradient" if on == "bg" and len(backs) > 1 else on
            msg = f"surface {name}: {col} {merged[col]} on {where} is {worst:.2f}:1, needs {minimum}:1"
            waived = waivable and any(w[0] == col and w[1] == on and w[2] in (None, name) for w in waivers)
            if waived and worst >= GRAPHIC_CONTRAST:
                warns.append(msg + "  [waived to 3:1: large text only; keep it on the review list]")
            elif waivable and worst >= GRAPHIC_CONTRAST:
                errors.append(msg + f'. The source does this? Then add {{"color": "{col}", "on": "{on}", "surface": "{name}", "reason": "..."}} to "waivers" and to "review". Otherwise change the colour.')
            else:
                fix = ensure_contrast(merged[col], targets[0], GRAPHIC_CONTRAST if not waivable else minimum)
                errors.append(msg + f". Below 3:1 nothing can be waived: change it (the nearest passing shade is about {fix}), keep the source hex in the palette, and say so in \"review\".")
    data = color.get("data", {})
    for need in ("categorical", "sequential", "diverging", "context"):
        if need not in data:
            errors.append(f"color.data.{need} is missing")
    hexes = lambda v: [c if isinstance(c, str) else c.get("hex") for c in (v.get("hex") if isinstance(v, dict) else v or [])]  # noqa: E731
    cat = hexes(data.get("categorical"))
    if cat and not MIN_CATEGORICAL <= len(cat) <= MAX_CATEGORICAL:
        errors.append(f"color.data.categorical has {len(cat)} colours; the compiler wants {MIN_CATEGORICAL} to {MAX_CATEGORICAL}")
    for ramp in ("sequential", "diverging"):
        if data.get(ramp) and len(hexes(data[ramp])) < 3:
            errors.append(f"color.data.{ramp} needs at least 3 colours")
    default_backs = surface_backs.get("default", ["#FFFFFF"])
    if cat and all(str(c).startswith("#") for c in cat):
        for c in cat:
            worst = min(C.contrast(c, b) for b in default_backs)
            if worst < GRAPHIC_CONTRAST:
                errors.append(f"data.categorical {c} is {worst:.2f}:1 on the default background; chart marks need 3:1. Use about {ensure_contrast(c, default_backs[0], 3.0)} and record the source colour as adjusted_from.")
        ctx = data.get("context")
        ctx = ctx.get("hex") if isinstance(ctx, dict) else ctx
        if ctx and str(ctx).startswith("#"):
            cr = min(C.contrast(ctx, b) for b in default_backs)
            if not CONTEXT_RANGE[0] <= cr <= CONTEXT_RANGE[1]:
                errors.append(f"data.context {ctx} is {cr:.2f}:1 on the default background; it must sit between {CONTEXT_RANGE[0]}:1 and {CONTEXT_RANGE[1]}:1, ideally at about 3:1 (visible as a thin line, but quieter than text)")
        for a, b in zip(cat, cat[1:]):
            dn = C.delta_e(a, b)
            cvd = {k: C.delta_e(C.simulate_cvd(a, k), C.simulate_cvd(b, k)) for k in ("deuteranopia", "protanopia", "tritanopia")}
            worst_kind = min(cvd, key=cvd.get)
            if dn < MIN_ADJACENT:
                errors.append(f"data.categorical neighbours {a} and {b} are ΔE {dn:.1f} apart; under {MIN_ADJACENT} fails. Reorder or replace one.")
            elif cvd[worst_kind] < MIN_ADJACENT_CVD:
                errors.append(f"data.categorical neighbours {a} and {b} are ΔE {cvd[worst_kind]:.1f} apart under {worst_kind}; under {MIN_ADJACENT_CVD} fails. Reorder so they are not adjacent, or change lightness.")
            elif dn < COMFORTABLE_ADJACENT:
                warns.append(f"data.categorical neighbours {a} and {b} are ΔE {dn:.1f} apart (comfortable is {COMFORTABLE_ADJACENT})")
        div = hexes(data.get("diverging"))
        if len(div) >= 2 and all(str(c).startswith("#") for c in (div[0], div[-1])):
            ends = min(C.delta_e(C.simulate_cvd(div[0], k), C.simulate_cvd(div[-1], k)) for k in ("deuteranopia", "protanopia"))
            if ends < MIN_DIVERGING_ENDS:
                errors.append(f"data.diverging ends {div[0]} and {div[-1]} are ΔE {ends:.1f} apart under red-green deficiency; under {MIN_DIVERGING_ENDS} fails. Use `data-palette --diverging-ends` with a blue against an orange or gold.")
    typ = d.get("typography", {})
    for fam in ("display", "body", "mono"):
        f = typ.get("families", {}).get(fam)
        if not f:
            errors.append(f"typography.families.{fam} is missing")
        elif not f.get("source") or f["source"].get("kind") not in ("fontsource", "files", "system", "unavailable"):
            errors.append(f"typography.families.{fam}.source.kind must be fontsource, files, system or unavailable")
    for step, s in typ.get("scale", {}).items():
        if s.get("size", 0) < 20:
            warns.append(f"typography.scale.{step} is {s.get('size')} px: under 20 px is unreadable on a projected 1920x1080 slide")
    if len(typ.get("scale", {})) < 5:
        warns.append("typography.scale has fewer than 5 steps")
    if not d.get("review"):
        warns.append("review list is empty: there is always at least a font licence or a low-confidence guess to hand to a human")
    if not d.get("layouts"):
        warns.append("layouts is empty: record which source pages map to which layout archetype")
    else:
        specs = [e for e in d["layouts"] if L.is_spec(e)]
        notes_only = [e for e in d["layouts"] if not L.is_spec(e)]
        if specs:
            catalog = None
            try:
                catalog = L.load_catalog(catalog_path, workspace)
            except (RuntimeError, OSError, ValueError, KeyError) as exc:
                warns.append(f"layouts: not checked against the layout catalog ({exc}); run `deckster layouts <deck> --json > catalog.json` and pass --catalog")
            lerrors, lwarns = L.check_specs(d["layouts"], catalog, set(surfaces), path.resolve().parent)
            errors += [f"layouts: {m}" for m in lerrors]
            warns += [f"layouts: {m}" for m in lwarns]
            kept = [e for e in specs if e.get("keep", True)]
            warns.append(f"layouts: {len(kept)} of {len(specs)} layout specs are kept for the brand ({len(specs) - len(kept)} dropped with keep: false)") if len(kept) != len(specs) else None
        if notes_only and not specs:
            warns.append("layouts holds notes only (archetype / maps_to): the brand gets no layouts of its own. A template's layouts come from `brand_tools.py propose-layouts`")
    return errors, warns


def propose_layouts_cmd(args) -> None:
    """Writes layout specs for every layout of the extraction into the draft's layouts[]."""
    ex = json.loads(args.extraction.read_text(encoding="utf-8"))
    draft = json.loads(args.draft.read_text(encoding="utf-8"))
    try:
        catalog = L.load_catalog(args.catalog, args.workspace)
    except (RuntimeError, OSError, ValueError, KeyError) as exc:
        sys.exit(f"propose-layouts needs the layout catalog: {exc}")
    # Art paths in the draft are relative to the draft's folder.
    rel = os.path.relpath(args.extraction.resolve().parent, args.draft.resolve().parent)
    for lo in ex.get("layouts", []):
        art = lo.get("art") or {}
        for k in ("svg", "svg_with_background"):
            if art.get(k):
                art[k] = (Path(rel) / art[k]).as_posix()
    specs, notes = L.propose(ex, catalog, draft, draft.get("name") or "brand", args.aspect_rule)
    for n in notes:
        print("note:", n)
    for sp in specs:
        fb = sp["fallback"] or "NO FALLBACK"
        print(f"  {sp['key']:<20} {sp['name']:<28} -> {fb:<10} surface {sp['surface']:<8} {len(sp['regions'])} regions{' +art' if sp.get('background') else ''}{'  unused' if sp['unused'] else ''}{'' if sp['keep'] else '  keep: false'}")
        for n in sp["notes"]:
            print("      -", n)
    print(f"{len(specs)} layout specs ({sum(1 for s_ in specs if s_['keep'])} kept)")
    if args.print_only or not specs:
        return
    old = [e for e in draft.get("layouts", []) if not L.is_spec(e)]
    existing = [e for e in draft.get("layouts", []) if L.is_spec(e)]
    if args.replace:
        draft["layouts"] = old + specs
        message = "specs regenerated (--replace); your notes kept"
    else:
        have = {e.get("key") for e in existing}
        added = [sp for sp in specs if sp["key"] not in have]
        draft["layouts"] = old + existing + added
        message = f"{len(existing)} existing specs kept as they are (your edits stay), {len(added)} new ones added; --replace regenerates all"
    args.draft.write_text(json.dumps(draft, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote", args.draft, f"(layouts[]: {message})")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("analyze")
    a.add_argument("extraction", type=Path)
    a.add_argument("--offline", action="store_true")
    c = sub.add_parser("contrast")
    c.add_argument("colors", nargs="+")
    c.add_argument("--all-pairs", action="store_true", help="also compare the other colours with each other")
    s = sub.add_parser("scale")
    s.add_argument("color")
    s.add_argument("--name", default="color")
    dp = sub.add_parser("data-palette")
    dp.add_argument("--bg", required=True)
    dp.add_argument("--fg", default="#111111")
    dp.add_argument("--colors", required=True, help="comma-separated brand colours, lead first")
    dp.add_argument("--source-series", default="", help="comma-separated series colours seen in the source's charts, in order")
    dp.add_argument("--n", type=int, default=6)
    dp.add_argument("--inverse-bg", default=None)
    dp.add_argument("--diverging-ends", default="", help="two colours, comma-separated, to use as the ends of the diverging scale instead of the automatic choice")
    cp = sub.add_parser("check-data-palette")
    cp.add_argument("--bg", required=True)
    cp.add_argument("--colors", required=True)
    f = sub.add_parser("fonts")
    f.add_argument("families", nargs="+")
    f.add_argument("--offline", action="store_true")
    cd = sub.add_parser("check-draft")
    cd.add_argument("draft", type=Path)
    cd.add_argument("--catalog", type=Path, default=None, help="`deckster layouts <deck> --json` saved to a file; by default it is run in --workspace")
    cd.add_argument("--workspace", type=Path, default=Path("."))
    pl = sub.add_parser("propose-layouts", help="turn every layout of a template extraction into a brand layout spec")
    pl.add_argument("extraction", type=Path)
    pl.add_argument("--draft", type=Path, required=True, help="the brand-draft.json: its name, surfaces and type scale are used, and its layouts[] is updated")
    pl.add_argument("--catalog", type=Path, default=None, help="`deckster layouts <deck> --json` saved to a file; by default it is run in --workspace")
    pl.add_argument("--workspace", type=Path, default=Path("."))
    pl.add_argument("--aspect-rule", choices=("auto", "uniform", "stretch"), default="auto", help="for a non-16:9 source: uniform (default) or stretch for layouts with no art")
    pl.add_argument("--print-only", action="store_true", help="print the proposal without changing the draft")
    pl.add_argument("--replace", action="store_true", help="regenerate every spec, discarding your edits; by default specs already in the draft (by key) are kept as they are")
    args = ap.parse_args()

    if args.cmd == "analyze":
        res = analyze(args.extraction, args.offline)
        out = args.extraction.parent / "analysis.json"
        out.write_text(json.dumps(res, indent=2, ensure_ascii=False, default=lambda o: dict(o) if isinstance(o, Counter) else sorted(o)))
        print(digest(res))
        print("wrote", out)
    elif args.cmd == "contrast":
        bg, rest = args.colors[0], args.colors[1:]
        pairs = [(bg, x) for x in rest] if rest else []
        if args.all_pairs:
            pairs += [(x, y) for i, x in enumerate(rest) for y in rest[i + 1:]]
        for x, y in pairs:
            r = C.contrast(x, y)
            verdict = "AAA" if r >= 7 else "AA" if r >= 4.5 else "AA large text / graphics only" if r >= 3 else "fail"
            print(f"{C.norm_hex(x)} vs {C.norm_hex(y)}: {r:.2f}:1  {verdict}")
    elif args.cmd == "scale":
        print(json.dumps({args.name: tonal_scale(args.color)}, indent=2))
    elif args.cmd == "data-palette":
        res = data_palette(args.bg, args.fg, [x for x in args.colors.split(",") if x], args.n, args.inverse_bg, [x for x in args.source_series.split(",") if x], [x for x in args.diverging_ends.split(",") if x])
        print(json.dumps(res, indent=2, ensure_ascii=False))
    elif args.cmd == "check-data-palette":
        cols = [C.norm_hex(x) for x in args.colors.split(",") if x]
        rep_ = cvd_report(cols)
        contrasts = {x: round(C.contrast(x, args.bg), 2) for x in cols}
        safe = 1
        for k in range(2, len(cols) + 1):
            if all(v["min_delta_e"] >= 8 for v in cvd_report(cols[:k]).values()):
                safe = k
            else:
                break
        problems = [f"{x} is {r}:1 on the background (3:1 wanted)" for x, r in contrasts.items() if r < 3]
        problems += [f"neighbours {v['worst_adjacent']} are close under {kind} (ΔE {v['min_adjacent_delta_e']})" for kind, v in rep_.items() if v["min_adjacent_delta_e"] < 8]
        print(json.dumps({"verdict": "pass" if not problems else "needs attention", "problems": problems, "safe_count": safe,
                          "contrast_on_bg": contrasts, "cvd": rep_}, indent=2, ensure_ascii=False))
    elif args.cmd == "fonts":
        print(json.dumps([font_report(x, args.offline) for x in args.families], indent=2, ensure_ascii=False))
    elif args.cmd == "propose-layouts":
        propose_layouts_cmd(args)
    elif args.cmd == "check-draft":
        errors, warns = check_draft(args.draft, args.catalog, args.workspace)
        for e in errors:
            print("ERROR  ", e)
        for w in warns:
            print("WARN   ", w)
        print(f"{len(errors)} errors, {len(warns)} warnings")
        sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
