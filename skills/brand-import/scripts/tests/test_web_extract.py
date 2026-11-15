"""Item 2 end to end: extract_web.py against a hostile page on a local server, in a real (headless) browser.

Runs only when Playwright, Pillow and numpy are importable (see _helpers.py for the command). The "site" is
allowed explicitly, as a user would allow their own localhost; the "internal service" on another port stands
for everything else on the machine and must never receive a request."""
from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import _helpers as H
import _server as S

SITE, INTERNAL, PROXY = 5965, 5966, 5967
BASE = f"http://127.0.0.1:{SITE}"
INNER = f"http://127.0.0.1:{INTERNAL}"
MARKER = b"TOP-SECRET-MARKER-7f3a"
HAVE_BROWSER = all(importlib.util.find_spec(m) is not None for m in ("playwright", "PIL", "numpy"))


def page(secret_file: Path) -> bytes:
    return f"""<!doctype html><html><head><title>Hostile</title>
<link rel="icon" href="{secret_file.as_uri()}">
<link rel="apple-touch-icon" href="/redirect-secret">
<link rel="mask-icon" href="/html-as-png">
<link rel="shortcut icon" href="/icon.png">
<link rel="stylesheet" href="{INNER}/secret.css">
<style>body{{font-family:sans-serif;margin:0}} header{{padding:20px}} section{{height:3000px}}</style>
</head><body>
<header><a href="/"><img class="logo" src="/redirect-metadata" width="120" height="30" alt="logo"></a>
<svg class="logo" width="120" height="30" viewBox="0 0 120 30" onload="window.pwned=1"><script>window.pwned=2</script>
<image href="{INNER}/secret-svg-image" width="1" height="1"/><rect width="120" height="30" fill="#D63913"/></svg>
<img class="logo" src="{INNER}/secret-img" width="120" height="30" alt="logo two">
<img id="logo-three" class="logo" src="/big-streamed.png" width="120" height="30" alt="logo three"></header>
<section><h1>Heading</h1><p>Some text for the extractor to measure.</p></section>
<script>
fetch("{INNER}/secret-fetch").catch(() => {{}});
fetch("/redirect-secret").then(r => r.text()).then(t => {{ document.title = t; }}).catch(() => {{}});
new Image().src = "http://localhost:{INTERNAL}/secret-localhost";
try {{ new WebSocket("ws://127.0.0.1:{INTERNAL}/secret-ws"); }} catch (e) {{}}
const frame = document.createElement("iframe"); frame.src = "{INNER}/secret-frame"; document.body.appendChild(frame);
setInterval(() => {{ document.body.appendChild(document.createElement("section")); fetch("/ping?" + Math.random()).catch(() => {{}}); }}, 50);
</script></body></html>""".encode()


@unittest.skipUnless(HAVE_BROWSER, "Playwright, Pillow and numpy are needed for the browser test")
class ExtractWebTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="brand-import-web-"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.secret = self.dir / "id_rsa"
        self.secret.write_bytes(b"-----BEGIN OPENSSH PRIVATE KEY-----\n" + MARKER + b"\n")
        secret = S.ok("image/png", H.PNG + MARKER)
        self.internal = S.Site(INTERNAL, {p: secret for p in ("/secret", "/secret-img", "/secret-fetch", "/secret-localhost", "/secret-frame", "/secret-svg-image", "/secret-ws")}
                               | {"/secret.css": S.ok("text/css", b":root{--stolen:#123456}/*" + MARKER + b"*/")})
        self.site = S.Site(SITE, {
            "/": S.ok("text/html; charset=utf-8", page(self.secret)),
            "/icon.png": S.ok("image/png", H.PNG),
            "/ping": S.ok("text/plain", b"ok"),
            "/redirect-secret": S.redirect(f"{INNER}/secret"),
            "/redirect-metadata": S.redirect("http://169.254.169.254/latest/meta-data/iam"),
            "/html-as-png": S.ok("image/png", b"<html>" + MARKER + b"</html>"),
            "/big-streamed.png": (200, {"Content-Type": "image/png"}, S.endless),
        })
        self.addCleanup(self.site.stop)
        self.addCleanup(self.internal.stop)

    def run_extractor(self, *urls: str):
        script = H.UNDER_TEST / "extract_web.py"
        flags = ["--no-dark", "--font-metadata"]
        if "--allow-origin" in script.read_text(encoding="utf-8"):
            flags += ["--allow-origin", BASE, "--proxy-port", str(PROXY)]
        out = self.dir / "out"
        run = subprocess.run([sys.executable, "-I", str(script), *urls, "--out", str(out), *flags], capture_output=True, text=True, timeout=240)
        return run, out

    def test_a_hostile_page_reaches_nothing_local_and_nothing_of_it_is_saved(self):
        run, out = self.run_extractor(BASE + "/")
        self.assertEqual(run.returncode, 0, run.stderr[-3000:])
        self.assertEqual(self.internal.hits, [], "the internal service received no request, from the script or from the page's own code")
        leaked = [str(p.relative_to(out)) for p in out.rglob("*") if p.is_file() and MARKER in p.read_bytes()]
        self.assertEqual(leaked, [], "no file under the output folder holds the secret")
        logos = sorted(p.name for p in (out / "assets/logos").iterdir())
        self.assertEqual([n for n in logos if not n.endswith(".png") and n != "logo-02.svg"], [], logos)
        self.assertIn("icon-04.png", logos)
        self.assertEqual((out / "assets/logos/icon-04.png").read_bytes(), H.PNG)
        svg = (out / "assets/logos/logo-02.svg").read_text()
        for bad in ("script", "onload", "pwned", str(INTERNAL), "<image"):
            self.assertNotIn(bad, svg)
        self.assertIn("<rect", svg)
        data = json.loads((out / "extraction.json").read_text(encoding="utf-8"))
        self.assertEqual(data["source"]["title"], "Hostile", "the page could not read the internal response through a redirect")
        blocked = {(b["by"], b["url"]): b["reason"] for b in data["blocked"]}
        text = json.dumps(data["blocked"])
        for needle in (self.secret.as_uri(), "/redirect-secret", "/redirect-metadata", "/html-as-png", "/big-streamed.png", f"{INNER}/secret.css", f"{INNER}/secret-img",
                       f"{INNER}/secret-fetch", f"localhost:{INTERNAL}/secret-localhost", f"{INNER}/secret-frame"):
            self.assertIn(needle, text, needle)
        self.assertIn("file:", blocked[("fetch", self.secret.as_uri())])
        self.assertIn("169.254.169.254", blocked[("fetch", BASE + "/redirect-metadata")])
        self.assertTrue(any("refused" in w for w in data["warnings"]))
        self.assertNotIn("--stolen", json.dumps(data["declared"]))

    def test_a_private_site_needs_an_explicit_allow(self):
        script = H.UNDER_TEST / "extract_web.py"
        out = self.dir / "out2"
        run = subprocess.run([sys.executable, "-I", str(script), BASE + "/", "--out", str(out), "--no-dark"], capture_output=True, text=True, timeout=120)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("--allow-origin", run.stderr)
        self.assertEqual(self.site.hits, [])
        self.assertFalse((out / "extraction.json").exists())


if __name__ == "__main__":
    unittest.main()
