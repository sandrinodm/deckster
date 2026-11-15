# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Extraction accuracy: run every extractor on the fixtures and compare with ground-truth.json.

Usage:
  uv run check_extraction.py --work <scratch dir> [--out results.json] [--soffice "<command>"]

Each check is exact unless it says otherwise. Without --soffice (and without LibreOffice
on PATH) the PPTX checks that need page images are reported as skipped, not failed.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
SKILL = HERE.parent
sys.path.insert(0, str(SKILL / "scripts"))
import _common as C  # noqa: E402


def run(script: str, *args: str) -> tuple[int, str]:
    p = subprocess.run(["uv", "run", str(SKILL / "scripts" / script), *args], capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr)[-1500:]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--soffice", default=None)
    args = ap.parse_args()
    gt = json.loads((HERE / "ground-truth.json").read_text())
    H, V = gt["halcyon"], gt["verdant"]
    files = HERE / "files"
    work = args.work
    work.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []

    def check(source: str, name: str, ok: bool | None, detail: str = "") -> None:
        results.append({"source": source, "check": name, "status": "skip" if ok is None else "pass" if ok else "fail", "detail": str(detail)[:300]})

    def hexes(ex: dict) -> set[str]:
        return {c["hex"] for c in ex["observed"]["colors"]}

    # ------------------------------------------------------------------ PDF
    code, log = run("extract_pdf.py", str(files / "halcyon-deck.pdf"), "--out", str(work / "pdf"))
    check("pdf", "extractor runs", code == 0, log if code else "")
    if code == 0:
        ex = json.loads((work / "pdf/extraction.json").read_text())
        want = {v for k, v in H["colors"].items()}
        check("pdf", "all 10 brand colours found exactly", want <= hexes(ex), sorted(want - hexes(ex)))
        check("pdf", "no spurious colours (observed = truth set)", hexes(ex) <= want, sorted(hexes(ex) - want))
        g = ex["observed"]["gradients"]
        check("pdf", "gradient stops exact from PDF shading", bool(g) and [s["hex"] for s in g[0]["stops"]] == H["gradient"]["stops"] and g[0]["origin"] == "pdf-shading", g[:1])
        check("pdf", "gradient angle 135", bool(g) and g[0].get("css_angle_deg") == 135, g[0].get("css_angle_deg") if g else None)
        fams = {f["family"] for f in ex["observed"]["fonts"]}
        check("pdf", "subset font families normalised (Space Grotesk, Inter, JetBrains Mono)", fams == set(H["fonts"].values()), sorted(fams))
        check("pdf", "all fonts flagged subset and not reusable", all(f["subset"] and f["reusable"] is False for f in ex["observed"]["fonts"]))
        check("pdf", "font licence evidence read from embedded font", all("copyright" in f["licence_evidence"] for f in ex["observed"]["fonts"]))
        sizes = {s["size_canvas_px"] for s in ex["observed"]["text_styles"]}
        want_sizes = {float(v) for v in H["type_canvas_px"].values()}
        check("pdf", "type sizes in canvas px match source CSS px", want_sizes <= sizes, sorted(want_sizes - sizes))
        bgs = [p["background"] for p in ex["pages"]]
        check("pdf", "page backgrounds: 7 paper, 1 ink, 2 gradient", [b.get("hex") for b in bgs].count(H["colors"]["bg"]) == 7 and [b.get("hex") for b in bgs].count(H["colors"]["fg"]) == 1
              and [b["kind"] for b in bgs].count("gradient") == 2, [(b["kind"], b.get("hex")) for b in bgs])
        pix = next(b for b in bgs if b["kind"] == "gradient")
        d0 = C.delta_e(pix["stops"][0]["hex"], H["gradient"]["stops"][0])
        d1 = C.delta_e(pix["stops"][-1]["hex"], H["gradient"]["stops"][1])
        check("pdf", "pixel gradient estimate within ΔE 1.5 of true stops, angle within 2 degrees", d0 < 1.5 and d1 < 1.5 and abs(pix["css_angle_deg"] - 135) <= 2, f"ΔE {d0:.2f}/{d1:.2f}, angle {pix['css_angle_deg']}")
        charts = ex["dataviz"]["charts"]
        check("pdf", "two charts detected on pages 8 and 9", sorted(c["page"] for c in charts) == H["charts"]["pages"], [(c["page"], c["kind_guess"]) for c in charts])
        bar = next((c for c in charts if c["kind_guess"].startswith("bar")), None)
        check("pdf", "bar chart: highlight + context colours and highlight pattern", bool(bar) and {s["hex"] for s in bar["series_colors"]} == {H["charts"]["bar"]["highlight"], H["charts"]["bar"]["context"]} and bar["highlight_pattern"], bar and bar["series_colors"])
        check("pdf", "bar chart: gridline colour", bool(bar) and bar["gridlines"]["color"] == H["charts"]["bar"]["gridline"])
        line = next((c for c in charts if c["kind_guess"] == "line"), None)
        check("pdf", "line chart: three series colours", bool(line) and {s["hex"] for s in line["series_colors"]} == set(H["charts"]["line_series"]), line and line["series_colors"])
        check("pdf", "big numbers with labels", [b["text"] for b in ex["dataviz"]["big_numbers"]] == H["big_numbers"] and all(b["label"] for b in ex["dataviz"]["big_numbers"]), [b["text"] for b in ex["dataviz"]["big_numbers"]])
        chrome = ex["assets"]["chrome"]
        check("pdf", "repeated logo region found bottom-left with SVG crop", bool(chrome) and chrome[0]["placement"] == "bottom-left" and bool(chrome[0]["svg"]) and (work / "pdf" / chrome[0]["svg"]).exists(), chrome[:1])
        radii = {r["radius"] for r in ex["observed"]["shapes"]["corner_radii_canvas_px"]}
        check("pdf", "corner radii 24 (±1), 8 and pill", bool(radii & {23, 24, 25}) and 8 in radii and "pill" in radii, sorted(map(str, radii)))
        check("pdf", "dashed gridlines detected as dashed (known limit: producer expands dashes)", bool(bar) and bar["gridlines"]["dashed_guess"] is True)

    # ------------------------------------------------------------------ PPTX
    render_args = ["--soffice", args.soffice] if args.soffice else []
    code, log = run("extract_pptx.py", str(files / "verdant-partner-meeting.pptx"), "--out", str(work / "pptx"), *render_args)
    check("pptx", "extractor runs", code == 0, log if code else "")
    if code == 0:
        ex = json.loads((work / "pptx/extraction.json").read_text())
        dec = {c["name"]: c["hex"] for c in ex["declared"]["colors"]}
        check("pptx", "theme colour scheme exact (10 slots)", all(dec.get(k) == v for k, v in V["theme_colors"].items()), {k: dec.get(k) for k in V["theme_colors"] if dec.get(k) != V["theme_colors"][k]})
        check("pptx", "theme fonts major/minor", {f["role"]: f["family"] for f in ex["declared"]["fonts"]} == {"major": V["fonts"]["display"], "minor": V["fonts"]["body"]})
        used = {c["name"]: c["used"] for c in ex["declared"]["colors"]}
        check("pptx", "unused theme accent flagged (accent5), used ones not", used["accent5"] is False and all(used[a] for a in ("accent1", "accent2", "accent3", "accent4", "accent6")), used)
        off = next((c for c in ex["observed"]["colors"] if c["hex"] == V["off_theme_highlight"]), None)
        check("pptx", "off-theme hard-coded highlight found with 8 uses, in_theme false", bool(off) and off["hard_coded_uses"] == 8 and off["in_theme"] is False, off)
        g = ex["observed"]["gradients"]
        check("pptx", "layout gradient: stops, CSS angle 45, attributed to slide 1", bool(g) and [s["hex"] for s in g[0]["stops"]] == V["gradient"]["stops"] and g[0]["css_angle_deg"] == 45 and g[0].get("pages") == [1], g[:1])
        fonts = {f["family"]: f for f in ex["observed"]["fonts"]}
        check("pptx", "observed fonts incl. stray Arial under 10%", set(fonts) == {V["fonts"]["display"], V["fonts"]["body"], "Arial"} and fonts["Arial"]["share"] < 0.1, {k: v["share"] for k, v in fonts.items()})
        lay = {l["name"]: len(l["used_by"]) for l in ex["layouts"] if l["used_by"]}
        check("pptx", "layout usage counts", lay == V["layouts_used"], lay)
        bgs = [p["background"].get("hex") for p in ex["pages"]]
        check("pptx", "slide backgrounds resolved through layout and master", bgs.count(V["roles"]["bg"]) == 9 and bgs.count(V["roles"]["inverse_bg"]) == 2, bgs)
        charts = ex["dataviz"]["charts"]
        bar = next((c for c in charts if c["kind"] == "bar"), None)
        line = next((c for c in charts if c["kind"] == "line"), None)
        check("pptx", "bar chart series colours in order", bool(bar) and bar["series_colors"] == V["charts"]["bar_series"], bar and bar["series_colors"])
        check("pptx", "line chart series colours in order", bool(line) and line["series_colors"] == V["charts"]["line_series"], line and line["series_colors"])
        val = next((a for a in bar["axes"] if a["type"] == "valAx"), {}) if bar else {}
        check("pptx", "gridline colour and width", (val.get("gridlines") or {}).get("color") == V["charts"]["gridline"] and (val.get("gridlines") or {}).get("width_pt") == 0.75, val.get("gridlines"))
        check("pptx", "data label number format", bool(bar) and bar["plots"][0]["data_labels"]["number_format"] == V["charts"]["data_label_format"])
        check("pptx", "legend: top on bar chart, none on line chart", bool(bar and line) and bar["legend"]["position"] == "t" and line["legend"] is None)
        t = ex["dataviz"]["tables"]
        check("pptx", "table header/body fills and header text", len(t) == 1 and t[0]["header"]["fill"] == V["table"]["header_fill"] and t[0]["header"]["text"]["color"] == V["table"]["header_text"] and t[0]["body"]["fill"] == V["table"]["body_fill"], t[:1])
        check("pptx", "big numbers", [b["text"] for b in ex["dataviz"]["big_numbers"]] == V["big_numbers"], [b["text"] for b in ex["dataviz"]["big_numbers"]])
        img = ex["assets"]["images"]
        check("pptx", "logo on master scored as top logo candidate, bottom-left", bool(img) and img[0]["on_masters"] and img[0]["logo_candidate_score"] >= 0.9 and img[0]["placements"][0]["bbox"][1] > 0.8 and img[0]["placements"][0]["bbox"][0] < 0.2, img[:1])
        rendered = [p for p in ex["pages"] if p.get("image")]
        if not rendered:
            check("pptx", "slides rendered to PNG", None, "no renderer available")
            check("pptx", "rendered gradient matches declared stops", None, "no renderer available")
        else:
            check("pptx", "slides rendered to PNG", len(rendered) == V["slides"], len(rendered))
            px = ex["pages"][0]["background"].get("pixels", {})
            ok = px.get("kind") == "gradient" and C.delta_e(px["stops"][0]["hex"], V["gradient"]["stops"][0]) < 1.5 and C.delta_e(px["stops"][-1]["hex"], V["gradient"]["stops"][1]) < 1.5
            check("pptx", "rendered gradient matches declared stops", ok, px)

    # ------------------------------------------------------------------ web
    code, log = run("extract_web.py", str(files / "halcyon-site/index.html"), "--out", str(work / "web"), "--font-metadata")
    check("web", "extractor runs", code == 0, log if code else "")
    if code == 0:
        ex = json.loads((work / "web/extraction.json").read_text())
        dec = {c["hex"] for c in ex["declared"]["colors"]}
        want = {H["colors"][k] for k in ("bg", "fg", "accent", "violet", "teal", "muted", "border", "card")}
        check("web", "8 colour custom properties resolved to hex", dec == want, sorted(dec ^ want))
        check("web", "all declared colours marked used (violet only via gradient)", all(c["used"] for c in ex["declared"]["colors"]), [c["name"] for c in ex["declared"]["colors"] if not c["used"]])
        check("web", "font custom properties", [f["family"] for f in ex["declared"]["fonts"]] == [H["fonts"]["display"], H["fonts"]["body"], H["fonts"]["mono"]])
        g = ex["observed"]["gradients"]
        check("web", "CSS gradient parsed: 135deg, exact stops", bool(g) and g[0]["css_angle_deg"] == 135 and [s["hex"] for s in g[0]["stops"]] == H["gradient"]["stops"], g[:1])
        m = ex["observed"]["motion"]["transitions"]
        check("web", "transition duration and easing", bool(m) and m[0]["duration"] == "0.18s" and m[0]["easing"] == H["web"]["easing"], m[:1])
        radii = {r["value"] for r in ex["observed"]["shapes"]["corner_radii"]}
        check("web", "radii 24px and pill", {"24px", "pill"} <= radii, sorted(radii))
        check("web", "card shadow captured", any("8px 24px" in s["value"] for s in ex["observed"]["shapes"]["shadows"]))
        ff = ex["declared"]["font_faces"]
        check("web", "5 @font-face rules, self-hosted, OFL licence URL read from the file", len(ff) == 5 and all(f["files"][0]["host"] == "self-hosted" and "OFL" in f["files"][0]["metadata"].get("license_url", "") for f in ff), len(ff))
        logos = ex["assets"]["logos"]
        check("web", "header logo saved as SVG", bool(logos) and logos[0]["why"] == "home link in header" and (work / "web" / logos[0]["file"]).exists(), logos[:1])
        pairs = {(p["background"], p["foreground"]): p["contrast"] for p in ex["observed"]["color_pairs"]}
        check("web", "white-on-coral pair measured at 3.1:1", pairs.get(("#FF5A36", "#FFFFFF")) == 3.1, pairs.get(("#FF5A36", "#FFFFFF")))
        ch = ex["dataviz"]["charts"]
        check("web", "SVG chart: series fills, dashed gridlines", len(ch) == 1 and {s["hex"] for s in ch[0]["series_colors"]} == {"#FF5A36", "#C9C3B6"} and any(gl["dash"] != "solid" for gl in ch[0]["gridlines"]), ch[:1] and ch[0]["gridlines"])
        h1 = ex["observed"]["components"].get("h1", {})
        check("web", "h1 computed style (76px, 700, -0.03em)", h1.get("font_size_px") == 76 and h1.get("font_weight") == 700 and h1.get("letter_spacing_em") == -0.03, h1)

    # ------------------------------------------------------------------ images
    code, log = run("extract_images.py", str(files / "halcyon-screenshots"), "--out", str(work / "images"))
    check("images", "extractor runs", code == 0, log if code else "")
    if code == 0:
        ex = json.loads((work / "images/extraction.json").read_text())
        want = {H["colors"][k] for k in ("bg", "fg", "accent", "violet", "teal", "border", "card")}
        check("images", "seven flat brand colours exact (white cards kept apart from off-white paper), gradient ramp pixels removed", hexes(ex) == want, sorted(hexes(ex) ^ want))
        g = ex["observed"]["gradients"]
        ok = bool(g) and abs(g[0]["css_angle_deg"] - 135) <= 2 and C.delta_e(g[0]["stops"][0]["hex"], "#FF5A36") < 1.5 and C.delta_e(g[0]["stops"][-1]["hex"], "#7A2CF5") < 1.5
        check("images", "gradient estimated from pixels within tolerance", ok, g[:1])
        check("images", "no fonts claimed", ex["observed"]["fonts"] == [])
        check("images", "thin muted text colour (#5B6472) recovered (expected miss: anti-aliased small text has no flat pixels)", "#5B6472" in hexes(ex), "small text never yields its exact colour from pixels; read it from a text-bearing source")

    # ------------------------------------------------------------------ tools
    code, log = run("brand_tools.py", "analyze", str(work / "pdf/extraction.json"), "--offline")
    if code == 0:
        a = json.loads((work / "pdf/analysis.json").read_text())
        r = a["role_candidates"]
        check("analyze", "pdf role candidates: bg, fg, muted, accent, border, inverse", [r[k]["hex"] for k in ("bg", "fg", "muted", "accent", "border", "inverse_bg")] == [H["colors"][k] for k in ("bg", "fg", "muted", "accent", "border")] + [H["colors"]["fg"]], {k: r.get(k, {}).get("hex") for k in ("bg", "fg", "muted", "accent", "border", "inverse_bg")})
        roles = {f["family"]: f["role_guess"] for f in a["fonts"]}
        check("analyze", "pdf font roles", roles == {"Space Grotesk": "display", "Inter": "body", "JetBrains Mono": "mono"}, roles)
    else:
        check("analyze", "analyze runs on pdf extraction", False, log)
    code, log = run("brand_tools.py", "analyze", str(work / "pptx/extraction.json"), "--offline")
    if code == 0:
        a = json.loads((work / "pptx/analysis.json").read_text())
        r = a["role_candidates"]
        check("analyze", "pptx role candidates: bg, fg, accent, inverse", [r[k]["hex"] for k in ("bg", "fg", "accent", "inverse_bg")] == [V["roles"][k] for k in ("bg", "fg", "accent", "inverse_bg")], {k: r.get(k, {}).get("hex") for k in ("bg", "fg", "accent", "inverse_bg")})
        check("analyze", "pptx: heading green listed as dark brand tone, gold highlight as off-theme", any(p["hex"] == V["roles"]["heading"] for p in r.get("dark_brand_tones", [])) and any(p["hex"] == V["off_theme_highlight"] for p in a["off_theme_but_frequent"]))
        roles = {f["family"]: f["role_guess"] for f in a["fonts"]}
        check("analyze", "pptx font roles incl. stray Arial", roles == {"Source Sans 3": "body", "Playfair Display": "display", "Arial": "stray"}, roles)
    else:
        check("analyze", "analyze runs on pptx extraction", False, log)

    summary = {s: sum(1 for r in results if r["status"] == s) for s in ("pass", "fail", "skip")}
    for r in results:
        print(f"{r['status'].upper():<5} {r['source']:<8} {r['check']}" + (f"   -> {r['detail']}" if r["status"] != "pass" and r["detail"] else ""))
    print(summary)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps({"summary": summary, "results": results}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
