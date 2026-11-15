# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright>=1.45", "pillow>=10", "numpy>=1.26", "fonttools>=4.50", "brotli>=1.1"]
# ///
"""Extract brand evidence from a live website (or a local HTML file) into extraction.json plus assets.

Usage:
  uv run extract_web.py <url-or-file> [<more urls> ...] --out <dir> [--width 1440] [--no-dark] [--font-metadata]
      [--allow-origin http://localhost:3000]

Needs a Chromium that Playwright can drive. The script tries the installed Google
Chrome first (channel="chrome"), then Playwright's bundled Chromium
(`uv run --with playwright playwright install chromium`).

Every URL becomes one "page". Pass the home page plus one or two content-heavy
pages (pricing, a blog post, a docs page) for better coverage of type and charts.

Writes:
  <out>/extraction.json
  <out>/pages/page-NNN.png            full-page screenshot (height capped)
  <out>/pages/page-NNN-fold.png       the first viewport
  <out>/assets/logos/                 logo candidates: inline SVGs, downloaded images, element screenshots, favicons
  <out>/assets/charts/                screenshots of chart-like elements

A web page is untrusted, and it chooses what this script requests. So (see _netsafe.py):

- The browser runs behind a filtering proxy and a request filter: only http(s), only hosts whose
  every address is public, checked again on every redirect hop, with the connection made to the
  address that was checked. Service workers, WebSockets, downloads and WebRTC are off.
- Logos, favicons, stylesheets and fonts the page names are fetched by the same rule, with size
  and time limits, and saved only when content type and first bytes say image (or font, in memory
  only), under names generated here. Inline and downloaded SVG is sanitised before it is saved.
- `file:` is read only for a local page passed on the command line, and only inside its folder.
- A site on this machine or network (http://localhost:3000) needs --allow-origin; nothing private
  is reachable by default. Everything refused is listed in extraction.json under `blocked`.
- The whole run has a wall-clock limit (--max-seconds); a page that never settles ends it.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import threading
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urljoin, urlparse

sys.path.insert(0, str(Path(__file__).parent))
import _common as C  # noqa: E402
import _filesafe as F  # noqa: E402
import _netsafe as N  # noqa: E402

# (hosts, path prefix, name, note). A host matches exactly; with a leading dot it matches that domain and its
# subdomains. The URL is parsed first: "fonts.gstatic.com.attacker.example" is not Google Fonts.
FONT_HOSTS = [
    (("fonts.gstatic.com", "fonts.googleapis.com"), "", "Google Fonts", "Open licences (mostly OFL). Usually available on Fontsource under the same name."),
    (("use.typekit.net", "p.typekit.net"), "", "Adobe Fonts", "Licensed through an Adobe subscription. Files may not be copied or self-hosted."),
    (("cloud.typography.com",), "", "Hoefler&Co Cloud.typography", "Commercial. Needs the owner's licence."),
    (("fast.fonts.net", ".fonts.com"), "", "Monotype", "Commercial. Needs the owner's licence."),
    (("fonts.bunny.net",), "", "Bunny Fonts", "Mirror of open fonts. Usually on Fontsource."),
    (("rsms.me",), "", "rsms (Inter)", "OFL."),
    (("cdn.jsdelivr.net",), "/npm/@fontsource", "Fontsource CDN", "Open licences."),
    (("unpkg.com",), "/@fontsource", "Fontsource CDN", "Open licences."),
]
SCROLL_JS = """async () => {
  const started = performance.now();
  const height = Math.min(document.documentElement.scrollHeight, 60000);
  for (let y = 0; y < height && performance.now() - started < 8000; y += 800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
}"""
FONTS_READY_JS = "() => Promise.race([document.fonts.ready.then(() => true), new Promise(r => setTimeout(() => r(false), 5000))])"
BROWSER_ARGS = ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--webrtc-ip-handling-policy=disable_non_proxied_udp",
                "--disable-features=WebRtcHideLocalIpsWithMdns,DnsOverHttps", "--dns-prefetch-disable", "--disable-background-networking", "--no-pings"]

COLLECT_JS = r"""
() => {
  const out = {};
  const toHex = (() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    return (css) => {
      if (!css || css === 'transparent' || css === 'none') return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000'; ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      if (d[3] === 0) return null;
      const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      return { hex, alpha: +(d[3] / 255).toFixed(3) };
    };
  })();
  const vw = window.innerWidth, vh = window.innerHeight;
  const docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  out.viewport = { width: vw, height: vh, doc_height: docH };
  out.title = document.title;
  out.lang = document.documentElement.lang || null;

  // ---- stylesheets: custom properties, @font-face, keyframes
  const vars = {}; const fontFaces = []; const blocked = []; let keyframes = 0;
  const walkRules = (rules, media) => {
    for (const rule of rules) {
      if (rule.type === 1 && rule.style) {
        for (const name of rule.style) {
          if (name.startsWith('--')) {
            (vars[name] = vars[name] || []).push({ selector: rule.selectorText, value: rule.style.getPropertyValue(name).trim(), media: media || null });
          }
        }
      } else if (rule.type === 5) {
        const s = rule.style;
        fontFaces.push({ family: (s.getPropertyValue('font-family') || '').replace(/["']/g, '').trim(), weight: s.getPropertyValue('font-weight') || '400',
          style: s.getPropertyValue('font-style') || 'normal', src: s.getPropertyValue('src'), display: s.getPropertyValue('font-display') || null,
          unicode_range: (s.getPropertyValue('unicode-range') || '').slice(0, 80) || null, base: rule.parentStyleSheet && rule.parentStyleSheet.href });
      } else if (rule.type === 7) { keyframes++; }
      else if (rule.cssRules) { walkRules(rule.cssRules, rule.conditionText || rule.media && rule.media.mediaText || media); }
    }
  };
  for (const sheet of document.styleSheets) {
    try { walkRules(sheet.cssRules, sheet.media && sheet.media.mediaText); }
    catch (e) { if (sheet.href) blocked.push(sheet.href); }
  }
  out.blocked_stylesheets = blocked;
  out.keyframes = keyframes;
  const rootCS = getComputedStyle(document.documentElement);
  out.css_vars = Object.entries(vars).map(([name, defs]) => {
    const rootDef = defs.find(d => /(^|,)\s*(:root|html|body)\s*(,|$)/.test(d.selector || '') && !/dark|prefers/.test(d.media || ''));
    const computed = rootCS.getPropertyValue(name).trim();
    const value = computed || (rootDef || defs[0]).value;
    const col = /^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/.test(value) || CSS.supports('color', value) ? toHex(value) : null;
    return { name, value: value.slice(0, 200), on_root: !!rootDef || !!computed, color: col && !/gradient/.test(value) ? col.hex : null,
      alpha: col ? col.alpha : null, definitions: defs.length,
      scoped: defs.filter(d => d !== rootDef).slice(0, 4).map(d => ({ selector: (d.selector || '').slice(0, 80), media: d.media, value: d.value.slice(0, 120) })) };
  });
  out.font_faces = fontFaces;
  out.fonts_loaded = [...document.fonts].map(f => ({ family: f.family.replace(/["']/g, ''), weight: f.weight, style: f.style, status: f.status }));
  out.font_resources = performance.getEntriesByType('resource').filter(r => /\.(woff2?|ttf|otf)(\?|$)/i.test(r.name) || r.initiatorType === 'css' && /font/i.test(r.name)).map(r => r.name);

  // ---- element walk
  const visible = (el, r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < docH;
  const firstFamily = (ff) => (ff || '').split(',')[0].replace(/["']/g, '').trim();
  const bgOf = (el) => {
    // Effective background behind an element: first ancestor with a non-transparent colour or a gradient/image.
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        return /gradient/.test(cs.backgroundImage) ? { kind: 'gradient', css: cs.backgroundImage.slice(0, 300) } : { kind: 'image' };
      }
      const c = toHex(cs.backgroundColor);
      if (c && c.alpha > 0.5) return { kind: 'solid', hex: c.hex };
      n = n.parentElement;
    }
    return { kind: 'solid', hex: '#FFFFFF' };
  };
  const colors = {}; const pairs = {}; const textStyles = {}; const radii = {}; const shadows = {}; const borders = {};
  const transitions = {}; const gradients = {}; const fontsUsed = {}; const spacing = {};
  const addColor = (hex, use, w) => { if (!hex) return; const c = (colors[hex] = colors[hex] || { text: 0, fill: 0, stroke: 0, background: 0 }); c[use] += w; };
  const pageArea = vw * docH;
  const all = document.body ? document.body.querySelectorAll('*') : [];
  let count = 0;
  const bigNumbers = [];
  let bodySize = parseFloat(getComputedStyle(document.body).fontSize) || 16;
  for (const el of all) {
    if (++count > 6000) break;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'head', 'meta', 'link'].includes(tag)) continue;
    if (el.closest('svg') && tag !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const area = Math.min(r.width * r.height, pageArea) / pageArea;
    const bg = toHex(cs.backgroundColor);
    if (bg && bg.alpha > 0.5) addColor(bg.hex, r.width >= vw * 0.9 && r.height >= 200 ? 'background' : 'fill', area);
    if (cs.backgroundImage && /gradient/.test(cs.backgroundImage)) {
      const g = cs.backgroundImage.slice(0, 400);
      (gradients[g] = gradients[g] || { area: 0, count: 0, sample: tag + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') });
      gradients[g].area += area; gradients[g].count++;
    }
    const bw = parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) || 0;
    if (bw > 0 && cs.borderTopStyle !== 'none') {
      const bc = toHex(parseFloat(cs.borderTopWidth) ? cs.borderTopColor : cs.borderBottomColor);
      if (bc && bc.alpha > 0.2) { addColor(bc.hex, 'stroke', 1); const k = bc.hex + '|' + bw; borders[k] = (borders[k] || 0) + 1; }
    }
    const rad = cs.borderTopLeftRadius;
    if (rad && rad !== '0px' && (bg && bg.alpha > 0.5 || bw > 0 || cs.backgroundImage !== 'none' || tag === 'img')) {
      const px = parseFloat(rad);
      const key = rad.includes('%') ? (parseFloat(rad) >= 50 ? 'circle' : rad) : (px >= Math.min(r.width, r.height) / 2 - 0.5 ? 'pill' : Math.round(px) + 'px');
      radii[key] = (radii[key] || 0) + 1;
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') shadows[cs.boxShadow] = (shadows[cs.boxShadow] || 0) + 1;
    if (cs.transitionDuration && cs.transitionDuration !== '0s' && cs.transitionProperty !== 'none') {
      const k = cs.transitionDuration.split(',')[0].trim() + '|' + cs.transitionTimingFunction.split(/,(?![^(]*\))/)[0].trim();
      transitions[k] = (transitions[k] || 0) + 1;
    }
    if (['section', 'main', 'header', 'footer'].includes(tag) && r.width >= vw * 0.8) {
      const k = [cs.paddingTop, cs.paddingLeft].join('|'); spacing[k] = (spacing[k] || 0) + 1;
    }
    // direct text
    let text = '';
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length) {
      const col = toHex(cs.color);
      const fam = firstFamily(cs.fontFamily);
      const size = +parseFloat(cs.fontSize).toFixed(1);
      if (col) {
        addColor(col.hex, 'text', text.length);
        const b = bgOf(el);
        const pk = (b.kind === 'solid' ? b.hex : b.kind) + '|' + col.hex;
        (pairs[pk] = pairs[pk] || { bg: b.kind === 'solid' ? b.hex : b.kind, bg_css: b.css || null, fg: col.hex, chars: 0, max_size: 0, sample: text.slice(0, 50) });
        pairs[pk].chars += text.length; pairs[pk].max_size = Math.max(pairs[pk].max_size, size);
      }
      const lh = cs.lineHeight === 'normal' ? null : +(parseFloat(cs.lineHeight) / size).toFixed(3);
      const ls = cs.letterSpacing === 'normal' ? 0 : +(parseFloat(cs.letterSpacing) / size).toFixed(4);
      const sk = [fam, cs.fontWeight, size, lh, ls, cs.textTransform, col && col.hex].join('|');
      const st = (textStyles[sk] = textStyles[sk] || { family: fam, stack: cs.fontFamily.slice(0, 160), weight: +cs.fontWeight, size_px: size, line_height_ratio: lh,
        letter_spacing_em: ls, text_transform: cs.textTransform, color: col && col.hex, italic: cs.fontStyle !== 'normal', chars: 0, tags: {}, sample: text.slice(0, 60),
        numeric: cs.fontVariantNumeric !== 'normal' ? cs.fontVariantNumeric : null });
      st.chars += text.length; st.tags[tag] = (st.tags[tag] || 0) + 1;
      (fontsUsed[fam] = fontsUsed[fam] || { chars: 0, weights: {} }); fontsUsed[fam].chars += text.length;
      fontsUsed[fam].weights[cs.fontWeight] = (fontsUsed[fam].weights[cs.fontWeight] || 0) + text.length;
      if (text.length <= 14 && /\d/.test(text) && size >= Math.max(bodySize * 2, 36) && !el.closest('svg')) {
        const sib = el.nextElementSibling || (el.parentElement && el.parentElement.nextElementSibling);
        let label = null;
        if (sib) { const scs = getComputedStyle(sib); const t = (sib.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length < 80 && parseFloat(scs.fontSize) < size * 0.6) { const lc = toHex(scs.color);
            label = { text: t.slice(0, 60), family: firstFamily(scs.fontFamily), weight: +scs.fontWeight, size_px: parseFloat(scs.fontSize), color: lc && lc.hex, position: 'below' }; } }
        bigNumbers.push({ text, family: fam, weight: +cs.fontWeight, size_px: size, color: col && col.hex, numeric: cs.fontVariantNumeric, label,
          bbox: [r.left / vw, (r.top + scrollY) / docH, r.width / vw, r.height / docH].map(v => +v.toFixed(4)) });
      }
    }
  }
  out.colors = colors; out.pairs = Object.values(pairs); out.text_styles = Object.values(textStyles);
  out.radii = radii; out.shadows = shadows; out.borders = borders; out.transitions = transitions; out.gradients = gradients;
  out.fonts_used = fontsUsed; out.spacing = spacing; out.big_numbers = bigNumbers.slice(0, 30); out.elements_walked = count;

  // ---- representative components
  const pick = (sel) => { for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return el; } return null; };
  const describe = (el) => { if (!el) return null; const cs = getComputedStyle(el); const bg = toHex(cs.backgroundColor); const col = toHex(cs.color); const bc = toHex(cs.borderTopColor);
    return { font_family: firstFamily(cs.fontFamily), font_size_px: parseFloat(cs.fontSize), font_weight: +cs.fontWeight,
      line_height_ratio: cs.lineHeight === 'normal' ? null : +(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(3),
      letter_spacing_em: cs.letterSpacing === 'normal' ? 0 : +(parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize)).toFixed(4), text_transform: cs.textTransform,
      color: col && col.hex, background: bg && bg.alpha > 0 ? bg.hex : null, background_image: cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 200) : null,
      border: parseFloat(cs.borderTopWidth) ? `${cs.borderTopWidth} ${cs.borderTopStyle} ${bc && bc.hex}` : null, border_radius: cs.borderTopLeftRadius,
      box_shadow: cs.boxShadow !== 'none' ? cs.boxShadow : null, padding: cs.padding, transition: cs.transitionDuration !== '0s' ? `${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}`.slice(0, 200) : null,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) }; };
  const comp = {};
  for (const [name, sel] of Object.entries({ body: 'body', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', paragraph: 'main p, article p, p', link: 'main a:not([class]), p a, a',
    button_primary: 'a[class*="primary" i], button[class*="primary" i], .btn, .button, button[type=submit], a[class*="btn" i], a[class*="button" i], button',
    button_secondary: '[class*="secondary" i], [class*="ghost" i], [class*="outline" i]', nav_link: 'nav a, header a', card: '[class*="card" i], article',
    code: 'pre, code', blockquote: 'blockquote', input: 'input[type=text], input[type=email], input:not([type])', badge: '[class*="badge" i], [class*="tag" i], [class*="pill" i], [class*="chip" i]',
    eyebrow: '[class*="eyebrow" i], [class*="kicker" i], [class*="overline" i]', footer: 'footer', table_header: 'th', table_cell: 'td', figcaption: 'figcaption' })) {
    try { const d = describe(pick(sel)); if (d) comp[name] = d; } catch (e) {}
  }
  out.components = comp;

  // ---- tables
  out.tables = [...document.querySelectorAll('table')].slice(0, 5).map(t => { const r = t.getBoundingClientRect(); if (!r.width) return null;
    const th = t.querySelector('th'), tds = [...t.querySelectorAll('tbody tr')].slice(0, 2).map(tr => tr.querySelector('td')).filter(Boolean);
    const rowBg = [...t.querySelectorAll('tbody tr')].slice(0, 2).map(tr => { const c = toHex(getComputedStyle(tr).backgroundColor) || (tr.querySelector('td') && toHex(getComputedStyle(tr.querySelector('td')).backgroundColor)); return c && c.hex; });
    return { rows: t.rows.length, cols: t.rows[0] ? t.rows[0].cells.length : 0, header: describe(th), body: describe(tds[0]), banded_guess: rowBg.length === 2 && rowBg[0] !== rowBg[1],
      numeric_align: tds[0] ? getComputedStyle([...t.querySelectorAll('td')].find(td => /^[\s$€£]*[\d.,]+/.test(td.textContent)) || tds[0]).textAlign : null,
      bbox: [r.left / vw, (r.top + scrollY) / docH, r.width / vw, r.height / docH].map(v => +v.toFixed(4)) }; }).filter(Boolean);

  // ---- charts
  const libs = { Chart: 'Chart.js', echarts: 'ECharts', Highcharts: 'Highcharts', Plotly: 'Plotly', d3: 'D3', ApexCharts: 'ApexCharts', vega: 'Vega', google: null };
  out.chart_libraries = Object.entries(libs).filter(([g, n]) => n && typeof window[g] !== 'undefined').map(([g, n]) => n);
  const charts = []; let ci = 0;
  for (const svg of document.querySelectorAll('svg')) {
    const r = svg.getBoundingClientRect();
    if (r.width < 160 || r.height < 90) continue;
    const cls = ((svg.getAttribute('class') || '') + ' ' + (svg.parentElement && svg.parentElement.className || '')).toString();
    const marks = svg.querySelectorAll('rect, path, circle, line, polyline');
    const texts = [...svg.querySelectorAll('text')];
    const named = /\bchart|recharts|highcharts|apexcharts|plotly|\bplot\b|vega|echarts|dataviz|sparkline/i.test(cls) || svg.hasAttribute('data-chart');
    const numericTexts = texts.filter(t => /^[\s$€£~+-]*\d[\d.,]*\s*[%kKmMbx]?/.test(t.textContent.trim()));
    if (!(named || (marks.length >= 6 && numericTexts.length >= 3))) continue;
    const fills = {}, strokes = {}, lines = {}; let rects = 0, polylines = 0, rounded = 0, arcs = 0;
    for (const m of marks) {
      const cs = getComputedStyle(m); const b = m.getBBox ? m.getBBox() : { width: 0, height: 0 };
      const f = toHex(cs.fill), s = toHex(cs.stroke); const sw = parseFloat(cs.strokeWidth) || 0;
      const thin = (b.height <= 2.5 && b.width > r.width * 0.3) || (b.width <= 2.5 && b.height > r.height * 0.3) || m.tagName === 'line';
      if (thin && s) { const k = s.hex + '|' + sw + '|' + (cs.strokeDasharray === 'none' ? 'solid' : cs.strokeDasharray); lines[k] = (lines[k] || 0) + 1; continue; }
      if (m.tagName === 'rect') { rects++; if (parseFloat(m.getAttribute('rx') || cs.rx || 0) > 0) rounded++; }
      if (m.tagName === 'polyline' || (m.tagName === 'path' && cs.fill === 'none' && b.width > r.width * 0.25)) polylines++;
      if (m.tagName === 'path' && /[aA]/.test(m.getAttribute('d') || '') && f) arcs++;
      if (f && cs.fill !== 'none' && b.width * b.height > 4) fills[f.hex] = (fills[f.hex] || 0) + b.width * b.height;
      if (s && cs.stroke !== 'none' && sw >= 1.5 && !thin) strokes[s.hex + '|' + sw] = (strokes[s.hex + '|' + sw] || 0) + 1;
    }
    const tstyles = {};
    for (const t of texts) { const cs = getComputedStyle(t); const f = toHex(cs.fill);
      const k = [firstFamily(cs.fontFamily), cs.fontWeight, parseFloat(cs.fontSize), f && f.hex].join('|'); (tstyles[k] = tstyles[k] || { n: 0, samples: [] }); tstyles[k].n++; if (tstyles[k].samples.length < 4) tstyles[k].samples.push(t.textContent.trim().slice(0, 16)); }
    svg.setAttribute('data-brand-import-chart', String(ci));
    charts.push({ index: ci++, origin: 'svg', named, class_hint: cls.trim().slice(0, 80), declared_kind: svg.getAttribute('data-chart'),
      kind_guess: arcs >= 2 ? 'pie-or-donut' : polylines >= 1 && rects < 3 ? 'line' : rects >= 3 ? 'bar' : 'unknown',
      fills: Object.entries(fills).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([hex, w]) => ({ hex, weight: Math.round(w) })),
      strokes: Object.entries(strokes).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ hex: k.split('|')[0], width_px: +k.split('|')[1], count: n })),
      gridlines: Object.entries(lines).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ color: k.split('|')[0], width_px: +k.split('|')[1], dash: k.split('|')[2], count: n })),
      bar_corner_rounded: rects ? rounded > 0 : null, has_legend_guess: !!(svg.querySelector('[class*="legend" i]') || svg.parentElement && svg.parentElement.querySelector('[class*="legend" i]')),
      text_styles: Object.entries(tstyles).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([k, v]) => { const [family, weight, size, color] = k.split('|'); return { family, weight: +weight, size_px: +size, color, count: v.n, samples: v.samples }; }),
      labels: texts.slice(0, 40).map(t => t.textContent.trim().slice(0, 16)),
      clipped_marks: (() => { const vb = svg.viewBox && svg.viewBox.baseVal; if (!vb || !vb.width) return 0; let n = 0; for (const m of marks) { try { const b = m.getBBox(); if (b.x + b.width > vb.x + vb.width + 1 || b.y + b.height > vb.y + vb.height + 1 || b.x < vb.x - 1) n++; } catch (e) {} } return n; })(),
      width_px: Math.round(r.width), height_px: Math.round(r.height), bbox: [r.left / vw, (r.top + scrollY) / docH, r.width / vw, r.height / docH].map(v => +v.toFixed(4)) });
  }
  for (const cv of document.querySelectorAll('canvas')) {
    const r = cv.getBoundingClientRect(); if (r.width < 200 || r.height < 120) continue;
    cv.setAttribute('data-brand-import-chart', String(ci));
    charts.push({ index: ci++, origin: 'canvas', kind_guess: 'unknown', note: 'Canvas chart: no structure available. Colours come from the element screenshot.',
      width_px: Math.round(r.width), height_px: Math.round(r.height), bbox: [r.left / vw, (r.top + scrollY) / docH, r.width / vw, r.height / docH].map(v => +v.toFixed(4)) });
  }
  // Unnamed SVGs with no recognisable marks are illustrations, and canvases without a chart library are usually decoration.
  out.charts = charts.filter(c => c.origin === 'svg' ? (c.named || c.kind_guess !== 'unknown') : out.chart_libraries.length > 0);

  // ---- logos, icons and meta
  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return null; } };
  const logos = []; const seen = new Set(); let li = 0;
  const addLogo = (el, why, score) => {
    if (!el || seen.has(el)) return; const r = el.getBoundingClientRect(); if (r.width < 12 || r.height < 8 || r.width > vw * 0.6) return; seen.add(el);
    const tag = el.tagName.toLowerCase(); el.setAttribute('data-brand-import-logo', String(li));
    const cs = getComputedStyle(el); const col = toHex(cs.color);
    logos.push({ index: li++, why, score, tag, src: tag === 'img' ? abs(el.currentSrc || el.src) : null, alt: el.getAttribute('alt') || el.getAttribute('aria-label') || (el.closest('a') && el.closest('a').getAttribute('aria-label')) || null,
      svg: tag === 'svg' ? el.outerHTML.slice(0, 60000) : null, current_color: col && col.hex, uses_current_color: tag === 'svg' && /currentColor/i.test(el.outerHTML),
      width_px: Math.round(r.width), height_px: Math.round(r.height), bbox: [r.left / vw, (r.top + scrollY) / docH, r.width / vw, r.height / docH].map(v => +v.toFixed(4)),
      background: bgOf(el) });
  };
  const q = (sel, why, score) => { try { for (const el of document.querySelectorAll(sel)) addLogo(el.tagName.toLowerCase() === 'a' ? el.querySelector('svg, img') : el, why, score); } catch (e) {} };
  q('header a[href="/"] svg, header a[href="/"] img, nav a[href="/"] svg, nav a[href="/"] img, a[aria-label*="home" i] svg, a[aria-label*="home" i] img', 'home link in header', 1.0);
  q('[class*="logo" i] svg, [class*="logo" i] img, svg[class*="logo" i], img[class*="logo" i], [id*="logo" i] svg, [id*="logo" i] img, img[alt*="logo" i], svg[aria-label*="logo" i]', 'named logo', 0.9);
  q('header svg, header img, nav svg, nav img', 'first graphic in header', 0.5);
  q('footer [class*="logo" i] svg, footer [class*="logo" i] img, footer a[href="/"] svg, footer a[href="/"] img', 'footer logo', 0.6);
  out.logos = logos.sort((a, b) => b.score - a.score).slice(0, 8);
  out.icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"], link[rel="shortcut icon"]')].map(l => ({ rel: l.rel, href: abs(l.href), sizes: l.getAttribute('sizes'), type: l.type || null, color: l.getAttribute('color') }));
  const meta = (n) => { const m = document.querySelector(`meta[name="${n}"], meta[property="${n}"]`); return m ? m.content : null; };
  out.meta = { theme_color: meta('theme-color'), og_image: meta('og:image') && abs(meta('og:image')), og_site_name: meta('og:site_name'), description: meta('description'),
    manifest: (document.querySelector('link[rel="manifest"]') || {}).href || null, color_scheme: meta('color-scheme'), generator: meta('generator') };
  try { out.jsonld_logo = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { const j = JSON.parse(s.textContent); const o = Array.isArray(j) ? j[0] : j; return o && (o.logo && (o.logo.url || o.logo)); } catch (e) { return null; } }).filter(Boolean)[0] || null; } catch (e) {}
  // inline icon style: stroke vs fill, stroke width, size
  const iconStats = { stroke: 0, fill: 0, widths: {}, sizes: {}, libs: {} };
  for (const svg of document.querySelectorAll('svg')) { const r = svg.getBoundingClientRect(); if (r.width < 10 || r.width > 48 || Math.abs(r.width - r.height) > 4) continue;
    const cs = getComputedStyle(svg); const p = svg.querySelector('path, line, circle, rect, polyline'); const pcs = p ? getComputedStyle(p) : cs;
    const stroked = pcs.stroke !== 'none' && (pcs.fill === 'none' || svg.getAttribute('fill') === 'none');
    iconStats[stroked ? 'stroke' : 'fill']++; if (stroked) { const w = parseFloat(pcs.strokeWidth) * (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? r.width / svg.viewBox.baseVal.width : 1); const k = (Math.round(w * 4) / 4) + 'px'; iconStats.widths[k] = (iconStats.widths[k] || 0) + 1; }
    iconStats.sizes[Math.round(r.width)] = (iconStats.sizes[Math.round(r.width)] || 0) + 1;
    const c = (svg.getAttribute('class') || ''); for (const [re, name] of [[/lucide/i, 'Lucide'], [/feather/i, 'Feather'], [/heroicon/i, 'Heroicons'], [/tabler/i, 'Tabler'], [/\bfa-|fontawesome/i, 'Font Awesome'], [/phosphor|\bph-/i, 'Phosphor'], [/material|\bmdi/i, 'Material'], [/bi-|bootstrap/i, 'Bootstrap Icons'], [/remix|\bri-/i, 'Remix'], [/iconify/i, 'Iconify']]) if (re.test(c)) iconStats.libs[name] = (iconStats.libs[name] || 0) + 1; }
  if (document.querySelector('[class*="fa-"]')) iconStats.libs['Font Awesome'] = (iconStats.libs['Font Awesome'] || 0) + 1;
  if (document.querySelector('.material-icons, .material-symbols-outlined')) iconStats.libs['Material'] = (iconStats.libs['Material'] || 0) + 1;
  out.icon_stats = iconStats;
  return out;
}
"""


def classify_font_host(url: str, page_host: str) -> tuple[str, str]:
    """Who serves a font file, by the URL's parsed host (never by searching the URL's text)."""
    try:
        parts = urlparse(url)
        host = (parts.hostname or "").lower().rstrip(".")
    except ValueError:
        return "unknown", "The font URL does not parse. Licence unknown."
    if parts.scheme in ("http", "https") and host:
        for hosts, prefix, name, note in FONT_HOSTS:
            if any(host == h or (h.startswith(".") and (host == h[1:] or host.endswith(h))) for h in hosts) and parts.path.startswith(prefix):
                return name, note
    if not host or host == (page_host or "").split(":")[0].lower() or parts.scheme == "file":
        return "self-hosted", "Licence unknown from the URL. Check the font's own metadata and ask the owner."
    return host, "Third-party host. Licence unknown."


def source_urls(given: list[str]) -> tuple[list[str], Path | None]:
    """The URLs to load, and the folder local files may be read from: the folder of the local page passed on
    the command line, or None when every source is a web address."""
    urls, root = [], None
    for u in given:
        if re.match(r"^https?://", u, re.I):
            urls.append(u)
            continue
        if re.match(r"^[a-z][a-z0-9+.-]*://", u, re.I) and not u.lower().startswith("file://"):
            sys.exit(f"Only http(s) addresses and local files can be extracted, not {u[:60]!r}.")
        path = Path(os.path.realpath(urlparse(u).path if u.lower().startswith("file://") else u))
        if not path.is_file():
            sys.exit(f"No such file: {path}")
        if root is None:
            root = path.parent
        elif os.path.commonpath([str(root), str(path)]) != str(root):
            sys.exit("Local pages must sit in one folder (the first one's): local files are read only from there.")
        urls.append(path.as_uri())
    return urls, root


def save_image(data: bytes, kind: str, base: Path, warnings: list[str], what: str) -> Path | None:
    """Write a fetched logo or icon as `<base>.<kind>`; SVG is sanitised first. Returns the path, or None."""
    if kind == "svg":
        try:
            data, removed = F.sanitize_svg(data)
        except F.Refused as exc:
            warnings.append(f"{what}: SVG not saved ({exc}). Use the PNG crop and add a review item.")
            return None
        if removed:
            warnings.append(f"{what}: SVG sanitised, removed {', '.join(removed)[:200]}. Compare it with the PNG crop.")
    dest = Path(f"{base}.{kind}")
    dest.write_bytes(data)
    return dest


def parse_gradient(css: str) -> dict | None:
    m = re.match(r"\s*(repeating-)?(linear|radial|conic)-gradient\((.*)\)\s*$", css, re.S)
    if not m:
        return None
    kind, body = m.group(2), m.group(3)
    parts = re.split(r",(?![^(]*\))", body)
    angle = None
    first = parts[0].strip()
    if kind == "linear":
        am = re.match(r"(-?[\d.]+)(deg|turn|rad|grad)", first)
        if am:
            v = float(am.group(1))
            angle = {"deg": v, "turn": v * 360, "rad": v * 57.2958, "grad": v * 0.9}[am.group(2)] % 360
            parts = parts[1:]
        elif first.startswith("to "):
            angle = {"to top": 0, "to right": 90, "to bottom": 180, "to left": 270, "to top right": 45, "to right top": 45, "to bottom right": 135,
                     "to right bottom": 135, "to bottom left": 225, "to left bottom": 225, "to top left": 315, "to left top": 315}.get(first, 180)
            parts = parts[1:]
        else:
            angle = 180
    elif re.match(r"(circle|ellipse|closest|farthest|at |from )", first):
        parts = parts[1:]
    stops = []
    for i, p in enumerate(parts):
        p = p.strip()
        cm = re.match(r"(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(?:oklch|oklab|lab|lch|color)\([^)]*\))\s*([\d.]+%|0(?:px)?(?![\d.]))?", p)
        if not cm:
            continue
        col = cm.group(1)
        hexv, alpha = None, 1.0
        rm = re.match(r"rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+%?))?", col)
        if rm:
            hexv = C.rgb_to_hex(float(rm.group(1)), float(rm.group(2)), float(rm.group(3)))
            if rm.group(4):
                alpha = float(rm.group(4).rstrip("%")) / (100 if rm.group(4).endswith("%") else 1)
        elif col.startswith("#"):
            hexv = C.norm_hex(col)
        pos = (float(cm.group(2).rstrip("%")) / 100 if cm.group(2).endswith("%") else 0.0) if cm.group(2) else None
        stops.append({"pos": pos, "hex": hexv, "alpha": alpha, "raw": None if hexv else col})
    for n, st in enumerate(stops):  # stops without a position are spread evenly, counted among the stops only
        if st["pos"] is None:
            st["pos"] = n / (len(stops) - 1) if len(stops) > 1 else 0
        st["pos"] = round(st["pos"], 4)
    return {"type": kind, "css_angle_deg": round(angle) if angle is not None else None, "stops": stops, "origin": "css", "css": css[:300],
            "at": (re.search(r"\bat\s+([\d.]+%\s+[\d.]+%)", css) or [None, None])[1]}


def font_file_metadata(data: bytes) -> dict:
    from fontTools.ttLib import TTFont  # noqa: PLC0415

    meta: dict = {}
    try:
        tt = TTFont(io.BytesIO(data), lazy=True)
        names = {n.nameID: str(n) for n in tt["name"].names} if "name" in tt else {}
        for key, nid in (("copyright", 0), ("name_family", 1), ("name_full", 4), ("version", 5), ("manufacturer", 8), ("license", 13), ("license_url", 14), ("typographic_family", 16)):
            if names.get(nid):
                meta[key] = names[nid][:240]
        if "OS/2" in tt:
            meta["fs_type"] = tt["OS/2"].fsType
            meta["vendor"] = getattr(tt["OS/2"], "achVendID", None)
            meta["weight_class"] = tt["OS/2"].usWeightClass
        meta["variable"] = "fvar" in tt
        if "fvar" in tt:
            meta["axes"] = [{"tag": a.axisTag, "min": a.minValue, "max": a.maxValue} for a in tt["fvar"].axes]
    except Exception as exc:  # noqa: BLE001
        meta["error"] = str(exc)[:160]
    return meta


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--no-dark", action="store_true", help="skip the prefers-color-scheme: dark pass")
    ap.add_argument("--font-metadata", action="store_true", help="download each font file into memory and read its name table (licence evidence); nothing is saved")
    ap.add_argument("--timeout", type=int, default=45000)
    ap.add_argument("--max-height", type=int, default=12000)
    ap.add_argument("--allow-origin", action="append", default=[], metavar="ORIGIN",
                    help="an origin on this machine or a private network that may be loaded, such as http://localhost:3000 (repeatable; none by default)")
    ap.add_argument("--max-seconds", type=int, default=0, help="wall-clock limit for the whole run (default: 90 per URL plus 60)")
    ap.add_argument("--proxy-port", type=int, default=0, help=argparse.SUPPRESS)
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    out = args.out
    for d in ("pages", "assets/logos", "assets/charts"):
        (out / d).mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    urls, local_root = source_urls(args.urls)
    try:
        policy = N.Policy(allow_origins=args.allow_origin, local_root=local_root)
    except ValueError as exc:
        sys.exit(f"--allow-origin: {exc}")
    for u in urls:
        reason = policy.browser_verdict(u)
        if reason:
            sys.exit(f"{u[:120]} cannot be loaded: {reason}. For a site you run on this machine or network, pass --allow-origin <scheme://host:port>.")
    limit_s = args.max_seconds or 90 * len(urls) + 60

    def out_of_time() -> None:
        print(f"extract_web.py: stopped after {limit_s} s without finishing (a page that never settles, or a very slow site). No extraction.json was written.", file=sys.stderr, flush=True)
        os._exit(3)

    watchdog = threading.Timer(limit_s, out_of_time)
    watchdog.daemon = True
    watchdog.start()
    proxy, proxy_url = N.start_proxy(policy, args.proxy_port)

    agg_colors: dict[str, dict] = defaultdict(lambda: {"text": 0.0, "fill": 0.0, "stroke": 0.0, "background": 0.0, "pages": set()})
    agg_styles: dict[tuple, dict] = {}
    agg_pairs: dict[tuple, dict] = {}
    agg = {k: Counter() for k in ("radii", "shadows", "borders", "transitions", "spacing")}
    grads: dict[str, dict] = {}
    fonts_used: dict[str, dict] = defaultdict(lambda: {"chars": 0, "weights": Counter()})
    font_faces: dict[tuple, dict] = {}
    css_vars: dict[str, dict] = {}
    dark_vars: dict[str, str] = {}
    pages, charts_out, tables_out, big_out, logos_out, icons_out = [], [], [], [], [], []
    components, meta, chart_libs, icon_stats = {}, {}, set(), None
    total_chars = 0

    with sync_playwright() as p:
        launch = {"proxy": {"server": proxy_url, "bypass": "<-loopback>"}, "args": BROWSER_ARGS}
        try:
            browser = p.chromium.launch(channel="chrome", **launch)
        except Exception:  # noqa: BLE001
            browser = p.chromium.launch(**launch)
        context = browser.new_context(viewport={"width": args.width, "height": args.height}, device_scale_factor=1, reduced_motion="reduce",
                                      service_workers="block", accept_downloads=False)
        N.guard_context(context, policy)
        context.set_default_timeout(30000)
        page = context.new_page()
        for i, url in enumerate(urls, 1):
            try:
                page.goto(url, wait_until="load", timeout=args.timeout)
                try:
                    page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:  # noqa: BLE001
                    pass
                page.evaluate(FONTS_READY_JS)
                # Trigger lazy content, then return to the top. Bounded in height and time: the page decides how tall it is.
                page.evaluate(SCROLL_JS)
                page.wait_for_timeout(300)
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"{url}: could not load ({str(exc)[:160]})")
                continue
            data = page.evaluate(COLLECT_JS)
            host = urlparse(page.url).netloc
            fold = out / "pages" / f"page-{i:03d}-fold.png"
            full = out / "pages" / f"page-{i:03d}.png"
            page.screenshot(path=str(fold))
            doc_h = min(data["viewport"]["doc_height"], args.max_height)
            page.screenshot(path=str(full), full_page=True, clip={"x": 0, "y": 0, "width": args.width, "height": doc_h})
            # One screenshot per full-width band (header, hero, sections, footer): these are the closest thing a website has to slides.
            sections = []
            try:
                handles = page.query_selector_all("body > header, body > section, body > footer, body > main > section, main > section, body > div > section")
                for si, hnd in enumerate(handles[:14]):
                    box = hnd.bounding_box()
                    if not box or box["width"] < args.width * 0.5 or box["height"] < 60:
                        continue
                    sp = out / "pages" / f"page-{i:03d}-section-{len(sections) + 1:02d}.png"
                    hnd.screenshot(path=str(sp), timeout=5000)
                    sections.append({"image": str(sp.relative_to(out)), "tag": hnd.evaluate("e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '')"),
                                     "background": C.analyze_background(sp), "height_px": round(box["height"])})
            except Exception:  # noqa: BLE001
                pass
            # Cross-origin stylesheets cannot be read through the CSSOM: fetch their text and pull out
            # @font-face blocks and :root custom properties with a plain scan.
            unread = 0
            for href in data["blocked_stylesheets"][:12]:
                try:
                    body, _kind = N.fetch(href, policy, "css", max_bytes=2 * 1024 * 1024)
                    css_text = body.decode("utf-8", "replace")
                except N.Blocked:
                    css_text = ""
                if not css_text:
                    unread += 1
                    continue
                for block in re.findall(r"@font-face\s*\{([^}]*)\}", css_text):
                    def prop(name_: str, default: str = "") -> str:
                        m_ = re.search(rf"{name_}\s*:\s*([^;]+)", block)
                        return m_.group(1).strip() if m_ else default
                    data["font_faces"].append({"family": re.sub(r"[\"']", "", prop("font-family")).strip(), "weight": prop("font-weight", "400"), "style": prop("font-style", "normal"),
                                               "src": prop("src"), "display": prop("font-display") or None, "unicode_range": None, "base": href})
                for block in re.findall(r"(?::root|html)\s*\{([^}]*)\}", css_text):
                    for name_, value_ in re.findall(r"(--[\w-]+)\s*:\s*([^;]+)", block):
                        if not any(v_["name"] == name_ for v_ in data["css_vars"]):
                            hexm = re.fullmatch(r"#[0-9a-fA-F]{3,8}", value_.strip())
                            data["css_vars"].append({"name": name_, "value": value_.strip()[:200], "on_root": True, "color": C.norm_hex(value_.strip()) if hexm else None,
                                                     "alpha": 1 if hexm else None, "definitions": 1, "scoped": []})
            if unread:
                warnings.append(f"{url}: {unread} cross-origin stylesheets could not be fetched (their custom properties and @font-face rules are missing; computed styles are still complete).")

            for hx, u in data["colors"].items():
                for k in ("text", "fill", "stroke", "background"):
                    agg_colors[hx][k] += u[k]
                agg_colors[hx]["pages"].add(i)
            for st in data["text_styles"]:
                key = (st["family"], st["weight"], st["size_px"], st["line_height_ratio"], st["letter_spacing_em"], st["text_transform"], st["color"])
                e = agg_styles.setdefault(key, {**st, "chars": 0, "tags": Counter(), "pages": set()})
                e["chars"] += st["chars"]
                e["tags"].update(st["tags"])
                e["pages"].add(i)
                total_chars += st["chars"]
            for pr in data["pairs"]:
                key = (pr["bg"], pr["fg"])
                e = agg_pairs.setdefault(key, {**pr, "chars": 0})
                e["chars"] += pr["chars"]
                e["max_size"] = max(e["max_size"], pr["max_size"])
            for k in agg:
                agg[k].update(data[k])
            for css, g in data["gradients"].items():
                e = grads.setdefault(css, {"area": 0.0, "count": 0, "sample": g["sample"], "pages": set()})
                e["area"] += g["area"]
                e["count"] += g["count"]
                e["pages"].add(i)
            for fam, fu in data["fonts_used"].items():
                fonts_used[fam]["chars"] += fu["chars"]
                fonts_used[fam]["weights"].update({int(k): v for k, v in fu["weights"].items()})
            for ff in data["font_faces"]:
                srcs = re.findall(r'url\(["\']?([^"\')]+)["\']?\)\s*(?:format\(["\']?([^"\')]+)["\']?\))?', ff["src"] or "")
                key = (ff["family"], ff["weight"], ff["style"])
                e = font_faces.setdefault(key, {"family": ff["family"], "weight": ff["weight"], "style": ff["style"], "display": ff["display"], "files": []})
                for src, fmt in srcs:
                    if src.startswith("data:"):
                        e["files"].append({"url": "data: (inlined)", "format": fmt or None, "host": "inline", "licence_note": "Inlined font. Licence unknown."})
                        continue
                    absu = urljoin(ff["base"] or page.url, src)
                    hname, note = classify_font_host(absu, host)
                    if not any(f["url"] == absu for f in e["files"]):
                        e["files"].append({"url": absu, "format": fmt or absu.rsplit(".", 1)[-1].split("?")[0], "host": hname, "licence_note": note})
            for v in data["css_vars"]:
                css_vars.setdefault(v["name"], v)
            components = components or data["components"]
            meta = meta or data["meta"]
            meta["jsonld_logo"] = meta.get("jsonld_logo") or data.get("jsonld_logo")
            chart_libs.update(data["chart_libraries"])
            icon_stats = icon_stats or data["icon_stats"]
            if i == 1:
                icons_out = data["icons"]

            for ch in data["charts"]:
                shot = out / "assets/charts" / f"page-{i:03d}-chart-{ch['index'] + 1:02d}.png"
                try:
                    page.locator(f'[data-brand-import-chart="{ch["index"]}"]').first.screenshot(path=str(shot), timeout=5000)
                    ch["image"] = str(shot.relative_to(out))
                    ch["palette"] = C.image_palette(shot, 8)
                except Exception:  # noqa: BLE001
                    ch["image"] = None
                ch["page"] = i
                if ch["origin"] == "svg":
                    series = [f for f in ch["fills"]] + [{"hex": s["hex"], "weight": s["count"]} for s in ch["strokes"] if s["hex"] not in {f["hex"] for f in ch["fills"]}]
                    ch["series_colors"] = series
                    ch["number_formats"] = [nf for nf in (C.number_format_of(t) for t in ch.pop("labels", [])) if nf][:12]
                    ch["confidence"] = 0.8 if ch["named"] else 0.5
                    if ch.get("clipped_marks"):
                        warnings.append(f"chart {ch['index'] + 1} on page {i}: {ch['clipped_marks']} marks lie outside the SVG viewBox and are not visible on the page. Their colours were read from the markup; check the chart screenshot.")
                else:
                    ch["series_colors"] = [{"hex": c["hex"], "weight": c["share"]} for c in ch.get("palette", [])[1:6]]
                    ch["confidence"] = 0.3
                charts_out.append(ch)
            for t in data["tables"]:
                tables_out.append({**t, "page": i, "origin": "html-table"})
            for b in data["big_numbers"]:
                big_out.append({**b, "page": i, "format": C.number_format_of(b["text"])})

            if i == 1:
                for lg in data["logos"]:
                    base = out / "assets/logos" / f"logo-{lg['index'] + 1:02d}"
                    try:
                        page.locator(f'[data-brand-import-logo="{lg["index"]}"]').first.screenshot(path=str(base) + ".png", timeout=5000, omit_background=True)
                        lg["png"] = str(Path(str(base) + ".png").relative_to(out))
                    except Exception:  # noqa: BLE001
                        lg["png"] = None
                    lg["file"] = None
                    what = f"logo candidate {lg['index'] + 1}"
                    if lg.get("svg"):
                        # Inline markup from the page: saved only as sanitised, static SVG.
                        svg = re.sub(r'\sdata-brand-import-(?:logo|chart)="\d+"', "", lg.pop("svg"))
                        if "xmlns=" not in svg[:300]:
                            svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
                        saved = save_image(svg.encode("utf-8", "replace"), "svg", base, warnings, what)
                        lg["file"] = str(saved.relative_to(out)) if saved else None
                    elif lg.get("src") and not lg["src"].startswith("data:"):
                        try:
                            body, kind = N.fetch(lg["src"], policy, "image")
                            saved = save_image(body, kind, base, warnings, what)
                            lg["file"] = str(saved.relative_to(out)) if saved else None
                        except N.Blocked as exc:
                            lg["blocked"] = str(exc)[:200]
                    lg.pop("svg", None)
                    logos_out.append(lg)
                for n, ic in enumerate(icons_out[:6]):
                    if not ic.get("href") or ic["href"].startswith("data:"):
                        continue
                    try:
                        body, kind = N.fetch(ic["href"], policy, "image")
                        saved = save_image(body, kind, out / "assets/logos" / f"icon-{n + 1:02d}", warnings, f"icon {n + 1}")
                        if saved:
                            ic["file"] = str(saved.relative_to(out))
                    except N.Blocked as exc:
                        ic["blocked"] = str(exc)[:200]

            pages.append({"index": i, "url": page.url, "title": data["title"], "image": str(full.relative_to(out)), "fold_image": str(fold.relative_to(out)),
                          "viewport": data["viewport"], "background": C.analyze_background(fold), "palette": C.image_palette(full, 8),
                          "charts": len(data["charts"]), "tables": len(data["tables"]), "elements_walked": data["elements_walked"], "sections": sections,
                          "layout_hints": ["web-page"]})

        # ---- dark scheme pass on the first URL: which custom properties change?
        if not args.no_dark and pages:
            try:
                page.emulate_media(color_scheme="dark")
                page.goto(urls[0], wait_until="load", timeout=args.timeout)
                page.wait_for_timeout(400)
                dark = page.evaluate("""() => { const cs = getComputedStyle(document.documentElement); const o = {}; for (const n of %s) o[n] = cs.getPropertyValue(n).trim(); const b = getComputedStyle(document.body); o.__bg = b.backgroundColor; o.__fg = b.color; return o; }""" % json.dumps(list(css_vars)[:400]))
                light_body = (components.get("body") or {})
                changed = {k: v for k, v in dark.items() if not k.startswith("__") and v and v != css_vars[k]["value"]}
                if changed or dark.get("__bg") not in (None, ""):
                    dark_vars = changed
                    if changed:
                        page.screenshot(path=str(out / "pages" / "page-001-dark-fold.png"))
                page.emulate_media(color_scheme="light")
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"dark scheme pass failed: {str(exc)[:120]}")

        if args.font_metadata:
            for ff in font_faces.values():
                for f in ff["files"][:1]:
                    if f["url"].startswith("data:"):
                        continue
                    try:
                        # Read in memory for the name table only; a font file from a site is never saved.
                        body, _kind = N.fetch(f["url"], policy, "font")
                        f["metadata"] = font_file_metadata(body)
                    except N.Blocked as exc:
                        f["metadata"] = {"error": f"not read: {str(exc)[:120]}"}
                    except Exception as exc:  # noqa: BLE001
                        f["metadata"] = {"error": str(exc)[:120]}
        browser.close()
    proxy.shutdown()
    if policy.blocked:
        warnings.append(f"{len(policy.blocked)} request(s) the page asked for were refused (non-public address, non-http scheme, wrong content, too large or too slow): see `blocked`. "
                        "This is deliberate. Do not fetch those URLs another way; report them to the user if they look like an attempt to reach local files or internal services.")

    if not pages:
        sys.exit("No page could be loaded: " + "; ".join(warnings))

    n = len(pages)
    observed_colors = []
    fill_total = sum(u["fill"] + u["background"] for u in agg_colors.values()) or 1
    for hx, u in agg_colors.items():
        weight = u["text"] / max(total_chars, 1) + (u["fill"] + u["background"]) / fill_total + 0.002 * u["stroke"]
        observed_colors.append({"hex": hx, "weight": round(weight, 4), "page_share": round(len(u["pages"]) / n, 2),
                                "uses": {k: round(u[k], 4) for k in ("text", "fill", "stroke", "background") if u[k]}, "pages": sorted(u["pages"])})
    observed_colors.sort(key=lambda c: -c["weight"])

    declared_colors, declared_other = [], []
    for name, v in css_vars.items():
        if v.get("color") and v.get("on_root"):
            declared_colors.append({"name": name, "hex": v["color"], "alpha": v["alpha"], "origin": f"css-var:{name}", "raw": v["value"],
                                    "dark_value": dark_vars.get(name), "scoped_overrides": v["scoped"] or None})
        elif v.get("on_root"):
            kind = ("gradient" if "gradient(" in v["value"] else "font" if re.search(r"family|font-(sans|serif|mono|display|body|heading|title)|^--font$", name) and re.search(r"^[\"']?[A-Za-z]{3}", v["value"]) and not re.search(r"(size|weight|height|spacing|ligatures|feature|variant)$", name) else "radius" if re.search(r"radius|round", name)
                    else "shadow" if "shadow" in name else "motion" if re.search(r"ease|duration|transition|cubic-bezier|\dms|\ds$", name + v["value"]) else
                    "space" if re.search(r"space|gap|pad|margin|gutter|size|width", name) else "other")
            declared_other.append({"name": name, "value": v["value"], "kind": kind, "dark_value": dark_vars.get(name)})
    if len(css_vars) > 400:
        warnings.append(f"{len(css_vars)} custom properties found (a utility framework or design-token dump). Only tokens whose value is actually used matter: filter declared.colors on used=true.")

    gradients_out = []
    for css, g in sorted(grads.items(), key=lambda kv: -kv[1]["area"]):
        parsed = parse_gradient(css) or {"type": "unknown", "stops": [], "origin": "css", "css": css[:300]}
        gradients_out.append({**parsed, "area_share": round(g["area"], 4), "count": g["count"], "sample_element": g["sample"], "pages": sorted(g["pages"])})
    for d in declared_other:
        if d["kind"] == "gradient":
            pg = parse_gradient(d["value"])
            if pg:
                d["parsed"] = pg

    used_hex = {c["hex"] for c in observed_colors} | {s_["hex"] for g in gradients_out for s_ in g["stops"] if s_.get("hex")}
    used_hex |= {c_["hex"] for ch in charts_out for c_ in ch.get("series_colors", [])}
    for dc in declared_colors:
        dc["used"] = dc["hex"] in used_hex

    fonts_out = []
    for fam, fu in sorted(fonts_used.items(), key=lambda kv: -kv[1]["chars"]):
        faces = [f for f in font_faces.values() if f["family"].lower() == fam.lower()]
        loaded = bool(faces)
        hosts = sorted({fl["host"] for f in faces for fl in f["files"]})
        generic = fam.lower() in ("serif", "sans-serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "-apple-system", "blinkmacsystemfont", "cursive", "inherit")
        evidence = next((fl["metadata"] for f in faces for fl in f["files"] if fl.get("metadata") and "error" not in fl["metadata"]), None)
        fonts_out.append({"family": fam, "chars": fu["chars"], "share": round(fu["chars"] / max(total_chars, 1), 3), "weights_used": dict(sorted(fu["weights"].items())),
                          "licence_evidence": {k: evidence[k] for k in ("copyright", "license", "license_url", "manufacturer", "vendor", "fs_type") if evidence.get(k) not in (None, "")} if evidence else None,
                          "webfont": loaded, "hosts": hosts, "system_or_generic": generic or not loaded,
                          "licence_note": next((fl["licence_note"] for f in faces for fl in f["files"]), "No @font-face: a system font or a fallback. The first family in the stack may not be the one that rendered."),
                          "subset": None, "embedded": False})

    styles_out = []
    for e in sorted(agg_styles.values(), key=lambda s: -s["chars"])[:50]:
        styles_out.append({**{k: e[k] for k in ("family", "weight", "italic", "size_px", "line_height_ratio", "letter_spacing_em", "text_transform", "color", "chars", "sample", "numeric")},
                           "tags": dict(e["tags"].most_common(4)), "pages": sorted(e["pages"]),
                           "note_size": "CSS px at the capture width, not canvas px. Use ratios between styles, not absolute sizes."})

    pairs_out = []
    for e in sorted(agg_pairs.values(), key=lambda s: -s["chars"])[:30]:
        ratio = round(C.contrast(e["bg"], e["fg"]), 2) if e["bg"].startswith("#") else None
        pairs_out.append({"background": e["bg"], "background_css": e.get("bg_css"), "foreground": e["fg"], "chars": e["chars"], "max_size_px": e["max_size"], "contrast": ratio, "sample": e["sample"]})

    def top(counter: Counter, n_: int = 8):
        return [{"value": k, "count": v} for k, v in counter.most_common(n_)]

    motion = []
    for k, v in agg["transitions"].most_common(8):
        dur, ease = k.split("|", 1)
        motion.append({"duration": dur, "easing": ease, "count": v})

    labels = [f"{pg['index']}: {urlparse(pg['url']).path or '/'}" for pg in pages]
    try:
        C.contact_sheet([out / pg["fold_image"] for pg in pages], out / "pages/contact-sheet.png", cols=min(3, n), thumb_w=640, labels=labels)
    except Exception:  # noqa: BLE001
        pass

    data_out = {
        "source": {"type": "web", "url": urls[0], "urls": urls, "title": pages[0]["title"], "page_count": n,
                   "page_size": {"width": args.width, "height": args.height, "unit": "css-px"},
                   "canvas_scale": {"note": "Web sizes are CSS px for a scrolling page. Map by role and ratio onto the 1920x1080 type scale, never 1:1."}},
        "tool": {"script": "extract_web.py"},
        "declared": {"colors": declared_colors,
                     "fonts": [{"role": d["name"], "family": re.sub(r"[\"']", "", d["value"].split(",")[0]).strip(), "stack": d["value"], "origin": f"css-var:{d['name']}"} for d in declared_other if d["kind"] == "font"], "tokens": [d for d in declared_other if d["kind"] != "font"][:200],
                     "font_faces": list(font_faces.values()), "meta": meta, "dark_scheme_overrides": dark_vars or None},
        "observed": {"colors": observed_colors[:60], "fonts": fonts_out, "text_styles": styles_out, "color_pairs": pairs_out, "gradients": gradients_out[:12],
                     "shapes": {"corner_radii": top(agg["radii"]), "shadows": top(agg["shadows"], 6), "borders": top(agg["borders"], 6), "section_padding": top(agg["spacing"], 5)},
                     "motion": {"transitions": motion, "note": "Durations and easings from computed transition styles. Scroll and JS-driven animation is not captured."},
                     "components": components, "icons": icon_stats},
        "pages": pages,
        "layouts": [],
        "assets": {"logos": logos_out, "icons": icons_out, "contact_sheet": "pages/contact-sheet.png"},
        "dataviz": {"charts": charts_out, "tables": tables_out, "big_numbers": big_out, "chart_libraries": sorted(chart_libs)},
        "blocked": policy.blocked,
        "warnings": warnings,
    }
    watchdog.cancel()
    path = C.write_extraction(out, data_out)
    print(C.summarize(data_out))
    print("logo candidates:", ", ".join(f"{l.get('file') or l.get('png')} ({l['why']})" for l in logos_out[:4]) or "none")
    print("wrote", path)


if __name__ == "__main__":
    main()
