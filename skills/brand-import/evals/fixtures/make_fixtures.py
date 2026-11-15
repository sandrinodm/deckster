# /// script
# requires-python = ">=3.12"
# dependencies = ["python-pptx>=1.0", "pillow>=10", "playwright>=1.45"]
# ///
"""Generate the eval fixtures for the brand-import skill.

Two fictional brands with known ground truth (see ../ground-truth.json):

  halcyon  -> HTML deck printed to PDF (subset fonts, gradient backgrounds),
              PNG screenshots of the same deck, and a small static website.
  verdant  -> PPTX with a custom theme, masters, layouts, a logo on the master,
              a gradient title background, one off-theme hard-coded colour that is
              used often, and one rogue font.

Usage:
  uv run make_fixtures.py --out ../files [--fonts-cache <dir>]

Fonts (all OFL) are downloaded from the Fontsource CDN into the cache directory.
Chrome is used through Playwright (`channel="chrome"`, falling back to the
bundled Chromium).
"""
from __future__ import annotations

import argparse
import shutil
import urllib.request
import zipfile
from pathlib import Path

FONT_FILES = {
    "space-grotesk-latin-700-normal.woff2": "space-grotesk@5.0.18",
    "space-grotesk-latin-500-normal.woff2": "space-grotesk@5.0.18",
    "inter-latin-400-normal.woff2": "inter@5.0.18",
    "inter-latin-600-normal.woff2": "inter@5.0.18",
    "jetbrains-mono-latin-400-normal.woff2": "jetbrains-mono@5.0.18",
}

HALCYON_CSS = """
@font-face { font-family: "Space Grotesk"; font-weight: 700; src: url("fonts/space-grotesk-latin-700-normal.woff2") format("woff2"); }
@font-face { font-family: "Space Grotesk"; font-weight: 500; src: url("fonts/space-grotesk-latin-500-normal.woff2") format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 400; src: url("fonts/inter-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 600; src: url("fonts/inter-latin-600-normal.woff2") format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; src: url("fonts/jetbrains-mono-latin-400-normal.woff2") format("woff2"); }
:root {
  --hl-ink: #0F1B2D;
  --hl-paper: #F7F4EE;
  --hl-white: #FFFFFF;
  --hl-coral: #FF5A36;
  --hl-violet: #7A2CF5;
  --hl-teal: #12B5A5;
  --hl-muted: #5B6472;
  --hl-line: #D9D4C7;
  --hl-gradient: linear-gradient(135deg, #FF5A36 0%, #7A2CF5 100%);
  --hl-radius: 24px;
  --hl-font-display: "Space Grotesk", sans-serif;
  --hl-font-body: "Inter", sans-serif;
  --hl-font-mono: "JetBrains Mono", monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
"""

LOGO_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48" width="220" height="48" role="img" aria-label="Halcyon">
<circle cx="24" cy="24" r="20" fill="{mark}"/><circle cx="24" cy="24" r="9" fill="{hole}"/>
<text x="56" y="33" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="28" fill="{text}">halcyon</text></svg>"""


def halcyon_bar_svg(w: int = 1680, h: int = 560) -> str:
    """Bar chart: one highlighted bar (coral), the rest in the context colour, direct labels."""
    data = [("Q1", 148), ("Q2", 131), ("Q3", 96), ("Q4", 56)]
    x0, y0, plot_h, bw, gap = 120, 40, h - 120, 220, 140
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" class="chart" data-chart="bar" width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    for i, tick in enumerate((0, 50, 100, 150)):
        y = y0 + plot_h - plot_h * tick / 150
        parts.append(f'<line x1="{x0}" y1="{y}" x2="{w - 40}" y2="{y}" stroke="#D9D4C7" stroke-width="2"{"" if i == 0 else ' stroke-dasharray="6 8"'}/>')
        parts.append(f'<text x="{x0 - 20}" y="{y + 7}" text-anchor="end" font-family="JetBrains Mono" font-size="20" fill="#5B6472">{tick}</text>')
    for i, (label, v) in enumerate(data):
        x = x0 + 80 + i * (bw + gap)
        bh = plot_h * v / 150
        fill = "#FF5A36" if i == len(data) - 1 else "#C9C3B6"
        parts.append(f'<rect x="{x}" y="{y0 + plot_h - bh}" width="{bw}" height="{bh}" rx="8" fill="{fill}"/>')
        parts.append(f'<text x="{x + bw / 2}" y="{y0 + plot_h - bh - 16}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="28" fill="#0F1B2D">{v}</text>')
        parts.append(f'<text x="{x + bw / 2}" y="{y0 + plot_h + 40}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="#5B6472">{label}</text>')
    parts.append("</svg>")
    return "".join(parts)


def halcyon_line_svg(w: int = 1680, h: int = 560) -> str:
    """Three-series line chart in coral, violet, teal with direct end labels and no legend."""
    series = [("Checkout", "#FF5A36", [82, 74, 61, 44, 31, 22]), ("Search", "#7A2CF5", [40, 44, 39, 35, 30, 27]), ("Identity", "#12B5A5", [20, 19, 22, 18, 15, 12])]
    x0, y0, plot_w, plot_h = 120, 40, w - 420, h - 120
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" class="chart" data-chart="line" width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    for i, tick in enumerate((0, 30, 60, 90)):
        y = y0 + plot_h - plot_h * tick / 90
        parts.append(f'<line x1="{x0}" y1="{y}" x2="{x0 + plot_w}" y2="{y}" stroke="#D9D4C7" stroke-width="2"{"" if i == 0 else ' stroke-dasharray="6 8"'}/>')
        parts.append(f'<text x="{x0 - 20}" y="{y + 7}" text-anchor="end" font-family="JetBrains Mono" font-size="20" fill="#5B6472">{tick}%</text>')
    for name, color, vals in series:
        pts = [(x0 + plot_w * i / (len(vals) - 1), y0 + plot_h - plot_h * v / 90) for i, v in enumerate(vals)]
        parts.append(f'<polyline fill="none" stroke="{color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}"/>')
        parts.append(f'<circle cx="{pts[-1][0]:.1f}" cy="{pts[-1][1]:.1f}" r="9" fill="{color}"/>')
        parts.append(f'<text x="{pts[-1][0] + 24:.1f}" y="{pts[-1][1] + 9:.1f}" font-family="Inter" font-weight="600" font-size="26" fill="{color}">{name} {vals[-1]}%</text>')
    parts.append("</svg>")
    return "".join(parts)


def halcyon_deck_html() -> str:
    logo_dark = LOGO_SVG.format(mark="#FF5A36", hole="#F7F4EE", text="#0F1B2D")
    logo_light = LOGO_SVG.format(mark="#FFFFFF", hole="#FF5A36", text="#FFFFFF")
    css = HALCYON_CSS + """
@page { size: 1920px 1080px; margin: 0; }
body { font-family: var(--hl-font-body); color: var(--hl-ink); }
.slide { width: 1920px; height: 1080px; padding: 96px 120px; position: relative; overflow: hidden;
  background: var(--hl-paper); page-break-after: always; break-after: page; display: flex; flex-direction: column; }
.slide .logo { position: absolute; left: 120px; bottom: 56px; }
.slide .pageno { position: absolute; right: 120px; bottom: 64px; font: 400 22px var(--hl-font-mono); color: var(--hl-muted); }
h1 { font: 700 120px/1.02 var(--hl-font-display); letter-spacing: -0.03em; }
h2 { font: 700 72px/1.08 var(--hl-font-display); letter-spacing: -0.02em; }
h3 { font: 500 48px/1.15 var(--hl-font-display); }
p, li { font: 400 32px/1.45 var(--hl-font-body); }
.eyebrow { font: 400 22px var(--hl-font-mono); text-transform: uppercase; letter-spacing: 0.12em; color: var(--hl-coral); margin-bottom: 28px; }
.muted { color: var(--hl-muted); }
.gradient { background: var(--hl-gradient); color: #fff; justify-content: center; }
.gradient .eyebrow { color: #fff; opacity: .85; }
.inverse { background: var(--hl-ink); color: var(--hl-paper); justify-content: center; }
.inverse .muted { color: #A9B2C0; }
ul { list-style: none; margin-top: 56px; }
li { padding: 22px 0 22px 44px; border-top: 2px solid var(--hl-line); position: relative; }
li::before { content: ""; position: absolute; left: 0; top: 38px; width: 16px; height: 16px; border-radius: 50%; background: var(--hl-coral); }
.split { flex-direction: row; gap: 80px; align-items: center; }
.split > div { flex: 1; }
.card { background: var(--hl-white); border: 2px solid var(--hl-line); border-radius: var(--hl-radius); padding: 48px; }
.panel { height: 720px; border-radius: var(--hl-radius); background: var(--hl-gradient); }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; margin-top: 72px; }
.stat .num { font: 700 120px/1 var(--hl-font-display); color: var(--hl-coral); letter-spacing: -0.03em; }
.stat .num.teal { color: var(--hl-teal); } .stat .num.violet { color: var(--hl-violet); }
.stat .label { font: 600 28px var(--hl-font-body); margin-top: 20px; }
blockquote { font: 500 64px/1.2 var(--hl-font-display); max-width: 1400px; }
.attrib { font: 600 28px var(--hl-font-body); margin-top: 48px; color: var(--hl-teal); }
pre { font: 400 26px/1.5 var(--hl-font-mono); background: var(--hl-ink); color: var(--hl-paper); border-radius: var(--hl-radius); padding: 48px; margin-top: 48px; }
pre .k { color: var(--hl-coral); } pre .s { color: var(--hl-teal); }
.pill { display: inline-block; font: 600 24px var(--hl-font-body); padding: 14px 32px; border-radius: 999px; background: var(--hl-coral); color: #fff; margin-top: 56px; }
"""
    slides = [
        f"""<section class="slide gradient"><div class="eyebrow">Product update / Q4</div>
<h1>Calm software<br>for loud systems</h1><p style="margin-top:40px;max-width:1100px">How Halcyon keeps eleven thousand services quiet at three in the morning.</p>
<div class="logo">{logo_light}</div></section>""",
        f"""<section class="slide"><div class="eyebrow">Agenda</div><h2>Three things worth your hour</h2>
<ul><li>Why alert volume doubled while incidents stayed flat</li><li>The routing engine we rebuilt this year</li><li>What ships in January, and what does not</li></ul>
<div class="logo">{logo_dark}</div><div class="pageno">02</div></section>""",
        f"""<section class="slide inverse"><div class="eyebrow">Part one</div><h1>Noise is a<br>design problem</h1>
<p class="muted" style="margin-top:40px">Most pages are true and useless.</p><div class="pageno">03</div></section>""",
        f"""<section class="slide split"><div><div class="eyebrow">Routing</div><h2>One owner per alert</h2>
<p class="muted" style="margin-top:32px">Every signal resolves to a single team before it reaches a person. Shared channels were where alerts went to be ignored.</p>
<span class="pill">Read the design note</span></div><div><div class="panel"></div></div>
<div class="logo">{logo_dark}</div><div class="pageno">04</div></section>""",
        f"""<section class="slide"><div class="eyebrow">Results</div><h2>After two quarters</h2>
<div class="stats"><div class="stat card"><div class="num">62%</div><div class="label">fewer pages per engineer</div></div>
<div class="stat card"><div class="num teal">4.1 min</div><div class="label">median time to acknowledge</div></div>
<div class="stat card"><div class="num violet">11k</div><div class="label">services onboarded</div></div></div>
<div class="logo">{logo_dark}</div><div class="pageno">05</div></section>""",
        f"""<section class="slide" style="justify-content:center"><blockquote>&ldquo;The first on-call week in years where I slept through every night.&rdquo;</blockquote>
<div class="attrib">Priya Raman, Staff SRE, Northgate Freight</div><div class="logo">{logo_dark}</div><div class="pageno">06</div></section>""",
        f"""<section class="slide"><div class="eyebrow">Configuration</div><h3>A route is twelve lines</h3>
<pre><span class="k">route</span> <span class="s">"checkout-latency"</span> {{
  owner    = <span class="s">"payments-oncall"</span>
  severity = <span class="k">page</span>
  quiet    = <span class="s">"deploy-window"</span>
}}</pre><div class="logo">{logo_dark}</div><div class="pageno">07</div></section>""",
        f"""<section class="slide"><div class="eyebrow">Pages per engineer, per week</div><h3>Pages fell by 62% once routing shipped in Q3</h3>
<div style="margin-top:40px">{halcyon_bar_svg()}</div><div class="logo">{logo_dark}</div><div class="pageno">08</div></section>""",
        f"""<section class="slide"><div class="eyebrow">Share of alerts that page a human</div><h3>Checkout improved most; identity was already quiet</h3>
<div style="margin-top:40px">{halcyon_line_svg()}</div><div class="logo">{logo_dark}</div><div class="pageno">09</div></section>""",
        f"""<section class="slide gradient"><h1>Sleep well.</h1><p style="margin-top:32px">halcyon.example / talk</p>
<div class="logo">{logo_light}</div></section>""",
    ]
    return f"<!doctype html><html><head><meta charset='utf-8'><title>Halcyon Q4</title><style>{css}</style></head><body>{''.join(slides)}</body></html>"


def halcyon_site_html() -> str:
    logo = LOGO_SVG.format(mark="#FF5A36", hole="#F7F4EE", text="#0F1B2D")
    css = HALCYON_CSS + """
body { font-family: var(--hl-font-body); color: var(--hl-ink); background: var(--hl-paper); font-size: 18px; line-height: 1.6; }
header { display: flex; align-items: center; justify-content: space-between; padding: 24px 64px; border-bottom: 1px solid var(--hl-line); }
nav a { margin-left: 32px; color: var(--hl-ink); text-decoration: none; font-weight: 600; font-size: 16px; }
.hero { padding: 120px 64px 96px; max-width: 1100px; }
.kicker { font: 400 14px var(--hl-font-mono); text-transform: uppercase; letter-spacing: .12em; color: var(--hl-coral); }
h1 { font: 700 76px/1.02 var(--hl-font-display); letter-spacing: -0.03em; margin: 20px 0 24px; }
h2 { font: 700 40px/1.1 var(--hl-font-display); letter-spacing: -0.02em; }
h3 { font: 500 24px/1.2 var(--hl-font-display); margin-bottom: 8px; }
.lede { font-size: 22px; color: var(--hl-muted); max-width: 720px; }
.btn { display: inline-block; margin-top: 36px; padding: 16px 32px; border-radius: 999px; font-weight: 600; text-decoration: none;
  background: var(--hl-coral); color: #fff; transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 180ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.btn.ghost { background: transparent; color: var(--hl-ink); border: 2px solid var(--hl-ink); margin-left: 12px; }
.band { background: var(--hl-gradient); color: #fff; padding: 96px 64px; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 96px 64px; }
.card { background: var(--hl-white); border: 1px solid var(--hl-line); border-radius: var(--hl-radius); padding: 32px; box-shadow: 0 8px 24px rgba(15, 27, 45, 0.08); }
.card p { color: var(--hl-muted); font-size: 16px; }
code { font-family: var(--hl-font-mono); font-size: 15px; background: var(--hl-ink); color: var(--hl-paper); padding: 2px 8px; border-radius: 6px; }
footer { background: var(--hl-ink); color: var(--hl-paper); padding: 64px; }
footer a { color: var(--hl-teal); }
"""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Halcyon — calm software for loud systems</title>
<meta name="theme-color" content="#FF5A36"><meta property="og:image" content="og.png">
<link rel="icon" type="image/svg+xml" href="favicon.svg"><style>{css}</style></head><body>
<header><a class="brand" href="/" aria-label="Halcyon home">{logo}</a><nav><a href="#">Product</a><a href="#">Pricing</a><a href="#">Docs</a></nav></header>
<section class="hero"><div class="kicker">Alert routing</div><h1>Calm software for loud systems</h1>
<p class="lede">Halcyon turns eleven thousand noisy services into one quiet on-call rotation.</p>
<a class="btn" href="#">Start free</a><a class="btn ghost" href="#">Book a demo</a></section>
<section class="band"><h2>62% fewer pages per engineer</h2><p>Measured across forty teams over two quarters.</p></section>
<section class="chartwrap" style="padding:96px 64px 0"><h2>Pages per engineer, per week</h2><div style="max-width:1100px;margin-top:32px">{halcyon_bar_svg(1100, 420)}</div></section>
<section class="cards"><div class="card"><h3>One owner per alert</h3><p>Every signal resolves to a single team.</p></div>
<div class="card"><h3>Quiet windows</h3><p>Deploys silence what they are about to break. Set it with <code>quiet = "deploy-window"</code>.</p></div>
<div class="card"><h3>Honest severity</h3><p>Pages are for people. Everything else is a ticket.</p></div></section>
<footer><p>Halcyon Labs, Rotterdam. <a href="#">Status</a></p></footer></body></html>"""


def licence_name(pkg: str) -> str:
    """The cache file name of a Fontsource package's LICENSE."""
    return f"{pkg.split('@')[0]}-LICENSE"


def font_licence(fonts: Path) -> str:
    """One OFL.txt for the copied fonts: each family's copyright line, then the OFL 1.1 text.

    The OFL requires both to travel with the font files.
    """
    texts = [(fonts / licence_name(pkg)).read_text() for pkg in sorted(set(FONT_FILES.values()))]
    copyrights = []
    for text in texts:
        first = text.splitlines()[0]
        copyrights.append(first[: first.index(")") + 1])
    body = texts[0][texts[0].index("This Font Software") :]
    return "\n".join(copyrights) + "\n\n" + body


def build_halcyon(out: Path, fonts: Path) -> None:
    from playwright.sync_api import sync_playwright

    for sub in ("halcyon-deck-src", "halcyon-site"):
        d = out / sub
        (d / "fonts").mkdir(parents=True, exist_ok=True)
        for f in FONT_FILES:
            shutil.copy(fonts / f, d / "fonts" / f)
        (d / "fonts" / "OFL.txt").write_text(font_licence(fonts))
    deck_src = out / "halcyon-deck-src"
    (deck_src / "index.html").write_text(halcyon_deck_html())
    site = out / "halcyon-site"
    (site / "index.html").write_text(halcyon_site_html())
    (site / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#FF5A36"/><circle cx="24" cy="24" r="9" fill="#F7F4EE"/></svg>'
    )
    shots = out / "halcyon-screenshots"
    shots.mkdir(exist_ok=True)
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome")
        except Exception:
            browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.goto(deck_src.joinpath("index.html").as_uri())
        page.evaluate("document.fonts.ready")
        page.pdf(path=str(out / "halcyon-deck.pdf"), width="1920px", height="1080px", print_background=True)
        # Screenshots of four slides only: the image-only eval gets partial evidence on purpose.
        for i in (0, 2, 3, 4):
            page.locator(".slide").nth(i).screenshot(path=str(shots / f"slide-{i + 1:02d}.png"))
        page.goto(site.joinpath("index.html").as_uri())
        page.screenshot(path=str(site / "og.png"), clip={"x": 0, "y": 0, "width": 1200, "height": 630})
        browser.close()
    # The PDF eval must not be able to read the HTML source, so the deck source is removed.
    shutil.rmtree(deck_src)


VERDANT_THEME_COLORS = {
    "dk1": "14261C", "lt1": "FFFFFF", "dk2": "1E4D36", "lt2": "F3EFE4",
    "accent1": "2E7D4F", "accent2": "D9A441", "accent3": "B5472F",
    "accent4": "3C6E91", "accent5": "7C6A9C", "accent6": "8A8D7A",
    "hlink": "2E7D4F", "folHlink": "7C6A9C",
}
VERDANT_MAJOR, VERDANT_MINOR = "Playfair Display", "Source Sans 3"
VERDANT_OFF_THEME = "F2C14E"  # hard-coded highlight used on several slides, not in the theme


def build_verdant(out: Path) -> None:
    import re

    from PIL import Image, ImageDraw
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.dml import MSO_THEME_COLOR
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.util import Emu, Inches, Pt

    tmp = out / "_verdant_tmp"
    tmp.mkdir(exist_ok=True)
    logo = Image.new("RGBA", (480, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(logo)
    d.polygon([(10, 110), (60, 10), (110, 110)], fill=(46, 125, 79, 255))
    d.polygon([(45, 110), (60, 70), (75, 110)], fill=(217, 164, 65, 255))
    d.rectangle([140, 50, 460, 70], fill=(20, 38, 28, 255))
    logo_path = tmp / "verdant-logo.png"
    logo.save(logo_path)

    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    W, H = prs.slide_width, prs.slide_height
    master = prs.slide_master
    # python-pptx cannot add pictures to a master directly: add to a scratch slide, then move the XML.
    _, rid = master.part.get_or_add_image_part(str(logo_path))
    scratch = prs.slides.add_slide(prs.slide_layouts[6])
    pic = scratch.shapes.add_picture(str(logo_path), Inches(0.5), H - Inches(0.75), height=Inches(0.4))
    el = pic._element
    el.blipFill.blip.set("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed", rid)
    master.shapes._spTree.append(el)
    sld_id = prs.slides._sldIdLst[0]
    prs.part.drop_rel(sld_id.rId)
    prs.slides._sldIdLst.remove(sld_id)
    master.background.fill.solid()
    master.background.fill.fore_color.theme_color = MSO_THEME_COLOR.BACKGROUND_2  # lt2 cream

    def scheme(run_or_fill, theme_color):
        run_or_fill.theme_color = theme_color

    L_TITLE, L_CONTENT, L_SECTION, L_TWO, L_TITLE_ONLY, L_BLANK = (prs.slide_layouts[i] for i in (0, 1, 2, 3, 5, 6))

    # Title layout: gradient background dk2 -> accent1.
    fill = L_TITLE.background.fill
    fill.gradient()
    fill.gradient_angle = 45
    stops = fill.gradient_stops
    stops[0].color.theme_color = MSO_THEME_COLOR.TEXT_2
    stops[1].color.theme_color = MSO_THEME_COLOR.ACCENT_1
    # Section layout: solid dk1.
    L_SECTION.background.fill.solid()
    L_SECTION.background.fill.fore_color.theme_color = MSO_THEME_COLOR.TEXT_1

    def set_text(shape, text, size=None, color=None, bold=None, font=None):
        tf = shape.text_frame
        tf.text = text
        for para in tf.paragraphs:
            for r in para.runs:
                if size:
                    r.font.size = Pt(size)
                if bold is not None:
                    r.font.bold = bold
                if font:
                    r.font.name = font
                if isinstance(color, RGBColor):
                    r.font.color.rgb = color
                elif color is not None:
                    r.font.color.theme_color = color

    s = prs.slides.add_slide(L_TITLE)
    set_text(s.shapes.title, "Patient capital for a warming world", 54, MSO_THEME_COLOR.BACKGROUND_1, True)
    set_text(s.placeholders[1], "Verdant Capital / Annual partner meeting", 22, MSO_THEME_COLOR.BACKGROUND_2)

    s = prs.slides.add_slide(L_CONTENT)
    set_text(s.shapes.title, "What we said we would do", 40, MSO_THEME_COLOR.TEXT_2, True)
    body = s.placeholders[1].text_frame
    body.text = "Deploy the third fund inside thirty months"
    for line in ("Hold fewer positions and know them better", "Publish every carbon number, including the bad ones"):
        body.add_paragraph().text = line
    for para in body.paragraphs:
        for r in para.runs:
            r.font.size = Pt(24)

    s = prs.slides.add_slide(L_SECTION)
    set_text(s.shapes.title, "Portfolio", 60, MSO_THEME_COLOR.BACKGROUND_1, True)
    set_text(s.placeholders[1], "Eleven companies, four exits", 24, MSO_THEME_COLOR.ACCENT_2)

    for title, nums in (("Fund III at a glance", ("412m", "11", "2.3x")), ("Climate outcomes", ("1.8Mt", "64%", "9"))):
        s = prs.slides.add_slide(L_TITLE_ONLY)
        set_text(s.shapes.title, title, 40, MSO_THEME_COLOR.TEXT_2, True)
        for i, n in enumerate(nums):
            x = Inches(0.9 + i * 4.0)
            card = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(2.2), Inches(3.6), Inches(3.4))
            card.fill.solid()
            card.fill.fore_color.theme_color = MSO_THEME_COLOR.BACKGROUND_1
            card.line.color.theme_color = MSO_THEME_COLOR.ACCENT_6
            card.adjustments[0] = 0.08
            tb = s.shapes.add_textbox(x + Inches(0.3), Inches(2.6), Inches(3.0), Inches(1.4))
            set_text(tb, n, 66, MSO_THEME_COLOR.ACCENT_1, True, VERDANT_MAJOR)
            bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x + Inches(0.3), Inches(4.3), Inches(1.2), Emu(60000))
            bar.fill.solid()
            bar.fill.fore_color.rgb = RGBColor.from_string(VERDANT_OFF_THEME)
            bar.line.fill.background()
            tb = s.shapes.add_textbox(x + Inches(0.3), Inches(4.5), Inches(3.0), Inches(0.8))
            set_text(tb, ("committed", "companies", "net multiple", "CO2e avoided", "renewable share", "board seats")[i + (3 if "Climate" in title else 0)], 18, MSO_THEME_COLOR.TEXT_1)

    # Native charts with explicit series colours, gridline style, number format and data labels.
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION

    DATA_COLORS = ("2E7D4F", "D9A441", "3C6E91")

    s = prs.slides.add_slide(L_TITLE_ONLY)
    set_text(s.shapes.title, "Solar carried the fund's returns", 40, MSO_THEME_COLOR.TEXT_2, True)
    cd = CategoryChartData(number_format='0.0"x"')
    cd.categories = ["2022", "2023", "2024", "2025"]
    cd.add_series("Solar", (1.2, 1.6, 2.1, 2.9))
    cd.add_series("Storage", (1.0, 1.1, 1.4, 1.8))
    cd.add_series("Grid software", (1.0, 0.9, 1.2, 1.5))
    gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.9), Inches(1.8), Inches(11.5), Inches(5), cd)
    ch = gf.chart
    ch.has_legend = True
    ch.legend.position = XL_LEGEND_POSITION.TOP
    ch.legend.include_in_layout = False
    ch.legend.font.size = Pt(14)
    ch.font.name = VERDANT_MINOR
    ch.font.size = Pt(14)
    ch.font.color.rgb = RGBColor.from_string("14261C")
    for ser, hexv in zip(ch.plots[0].series, DATA_COLORS):
        ser.format.fill.solid()
        ser.format.fill.fore_color.rgb = RGBColor.from_string(hexv)
    ch.plots[0].gap_width = 60
    ch.plots[0].has_data_labels = True
    dl = ch.plots[0].data_labels
    dl.number_format = '0.0"x"'
    dl.number_format_is_linked = False
    dl.position = XL_LABEL_POSITION.OUTSIDE_END
    dl.font.size = Pt(12)
    va = ch.value_axis
    va.has_major_gridlines = True
    va.major_gridlines.format.line.color.rgb = RGBColor.from_string("D8D2C2")
    va.major_gridlines.format.line.width = Pt(0.75)
    va.format.line.fill.background()
    va.tick_labels.font.size = Pt(12)
    va.tick_labels.font.color.rgb = RGBColor.from_string("8A8D7A")
    ch.category_axis.format.line.color.rgb = RGBColor.from_string("8A8D7A")
    ch.category_axis.tick_labels.font.size = Pt(12)

    s = prs.slides.add_slide(L_TITLE_ONLY)
    set_text(s.shapes.title, "Deployment stayed on plan", 40, MSO_THEME_COLOR.TEXT_2, True)
    cd = CategoryChartData(number_format='#,##0"m"')
    cd.categories = ["H1 23", "H2 23", "H1 24", "H2 24", "H1 25"]
    cd.add_series("Deployed", (60, 142, 231, 330, 412))
    cd.add_series("Plan", (70, 150, 235, 320, 400))
    gf = s.shapes.add_chart(XL_CHART_TYPE.LINE, Inches(0.9), Inches(1.8), Inches(11.5), Inches(5), cd)
    ch = gf.chart
    ch.has_legend = False
    ch.font.name = VERDANT_MINOR
    ch.font.size = Pt(14)
    for ser, hexv, w in zip(ch.plots[0].series, ("2E7D4F", "8A8D7A"), (3, 1.5)):
        ser.format.line.color.rgb = RGBColor.from_string(hexv)
        ser.format.line.width = Pt(w)
        ser.smooth = False
    ch.value_axis.has_major_gridlines = True
    ch.value_axis.major_gridlines.format.line.color.rgb = RGBColor.from_string("D8D2C2")
    ch.value_axis.format.line.fill.background()

    s = prs.slides.add_slide(L_TITLE_ONLY)
    set_text(s.shapes.title, "Exits to date", 40, MSO_THEME_COLOR.TEXT_2, True)
    rows = [("Company", "Sector", "Held", "Multiple"), ("Tidewater Storage", "Storage", "5.2 yrs", "3.4x"), ("Brightline", "Solar", "4.0 yrs", "2.8x"), ("Kestrel Grid", "Software", "6.1 yrs", "1.9x")]
    tbl = s.shapes.add_table(len(rows), 4, Inches(0.9), Inches(2.0), Inches(11.5), Inches(3.2)).table
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = tbl.cell(r, c)
            cell.text = val
            cell.fill.solid()
            cell.fill.fore_color.rgb = RGBColor.from_string("1E4D36" if r == 0 else "FFFFFF")
            run = cell.text_frame.paragraphs[0].runs[0]
            run.font.size = Pt(16)
            run.font.bold = r == 0
            run.font.color.rgb = RGBColor.from_string("FFFFFF" if r == 0 else "14261C")

    s = prs.slides.add_slide(L_TWO)
    set_text(s.shapes.title, "Two ways we lose money", 40, MSO_THEME_COLOR.TEXT_2, True)
    set_text(s.placeholders[1], "Paying for growth that policy was about to hand out for free", 24)
    set_text(s.placeholders[2], "Backing hardware teams who have never shipped hardware", 24)
    tag = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(6.2), Inches(2.6), Inches(0.5))
    tag.fill.solid()
    tag.fill.fore_color.rgb = RGBColor.from_string(VERDANT_OFF_THEME)
    tag.line.fill.background()
    set_text(tag, "Lessons", 16, MSO_THEME_COLOR.TEXT_1, True)

    s = prs.slides.add_slide(L_BLANK)
    tb = s.shapes.add_textbox(Inches(1.2), Inches(1.8), Inches(10.8), Inches(3))
    tb.text_frame.word_wrap = True
    set_text(tb, "“They were the only investors who asked to see the failed pilot first.”", 40, MSO_THEME_COLOR.TEXT_2, False, VERDANT_MAJOR)
    tb = s.shapes.add_textbox(Inches(1.2), Inches(5.2), Inches(10), Inches(0.6))
    set_text(tb, "Mara Okafor, founder, Tidewater Storage", 18, MSO_THEME_COLOR.ACCENT_3, True)
    hl = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.2), Inches(1.4), Inches(1.5), Emu(80000))
    hl.fill.solid()
    hl.fill.fore_color.rgb = RGBColor.from_string(VERDANT_OFF_THEME)
    hl.line.fill.background()

    s = prs.slides.add_slide(L_CONTENT)
    set_text(s.shapes.title, "Appendix: methodology", 40, MSO_THEME_COLOR.TEXT_2, True)
    set_text(s.placeholders[1], "Pasted from an old template, in the wrong font.", 20, RGBColor(0x44, 0x44, 0x44), None, "Arial")

    s = prs.slides.add_slide(L_SECTION)
    set_text(s.shapes.title, "Thank you", 60, MSO_THEME_COLOR.BACKGROUND_1, True)
    set_text(s.placeholders[1], "partners@verdant.example", 24, MSO_THEME_COLOR.ACCENT_2)

    raw = tmp / "raw.pptx"
    prs.save(raw)

    # Rewrite the theme: colour scheme and font scheme.
    dst = out / "verdant-partner-meeting.pptx"
    with zipfile.ZipFile(raw) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if re.fullmatch(r"ppt/theme/theme\d+\.xml", item.filename):
                xml = data.decode("utf-8")
                for slot, hexv in VERDANT_THEME_COLORS.items():
                    xml = re.sub(
                        rf"(<a:{slot}>)\s*<a:(?:srgbClr|sysClr)[^>]*/>\s*(</a:{slot}>)",
                        rf'\g<1><a:srgbClr val="{hexv}"/>\g<2>', xml)
                xml = re.sub(r'(<a:majorFont>\s*<a:latin typeface=")[^"]*', rf"\g<1>{VERDANT_MAJOR}", xml)
                xml = re.sub(r'(<a:minorFont>\s*<a:latin typeface=")[^"]*', rf"\g<1>{VERDANT_MINOR}", xml)
                xml = re.sub(r'(<a:clrScheme name=")[^"]*', r"\g<1>Verdant", xml)
                xml = re.sub(r'(<a:fontScheme name=")[^"]*', r"\g<1>Verdant", xml)
                data = xml.encode("utf-8")
            if re.fullmatch(r"ppt/slideLayouts/slideLayout\d+\.xml", item.filename):
                # python-pptx's default gradient carries tint/shade/satMod children; strip them so the stops are exactly the theme colours.
                xml = data.decode("utf-8")
                xml = re.sub(r"<a:(tint|shade|satMod) val=\"\d+\"/>", "", xml)
                data = xml.encode("utf-8")
            zout.writestr(item, data)
    shutil.rmtree(tmp)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--fonts-cache", type=Path, default=None)
    args = ap.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    fonts = (args.fonts_cache or out / "_fonts").resolve()
    fonts.mkdir(parents=True, exist_ok=True)
    for name, pkg in FONT_FILES.items():
        if not (fonts / name).exists():
            urllib.request.urlretrieve(f"https://cdn.jsdelivr.net/npm/@fontsource/{pkg}/files/{name}", fonts / name)
    for pkg in set(FONT_FILES.values()):
        licence = fonts / licence_name(pkg)
        if not licence.exists():
            urllib.request.urlretrieve(f"https://cdn.jsdelivr.net/npm/@fontsource/{pkg}/LICENSE", licence)
    build_halcyon(out, fonts)
    build_verdant(out)
    if args.fonts_cache is None:
        shutil.rmtree(fonts)
    print("fixtures written to", out)


if __name__ == "__main__":
    main()
