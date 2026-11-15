"""Items 2 and 7: everything a page names is fetched through one guarded function, the browser's own requests
go through a proxy that applies the same rule, and font hosts are classified by parsed host."""
from __future__ import annotations

import importlib
import os
import shutil
import socket
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import _helpers as H
import _server as S

import _netsafe as N

SITE, INTERNAL, PROXY = 5960, 5961, 5962
BASE = f"http://127.0.0.1:{SITE}"


def routes() -> dict:
    return {
        "/icon.png": S.ok("image/png", H.PNG),
        "/logo.svg": S.ok("image/svg+xml", H.SVG),
        "/font.woff2": S.ok("font/woff2", H.WOFF2),
        "/style.css": S.ok("text/css", b":root{--x:#123456}"),
        "/redirect-secret": S.redirect(f"http://127.0.0.1:{INTERNAL}/secret"),
        "/redirect-localhost": S.redirect(f"http://localhost:{INTERNAL}/secret"),
        "/redirect-metadata": S.redirect("http://169.254.169.254/latest/meta-data/"),
        "/redirect-file": S.redirect("file:///etc/hosts"),
        "/redirect-ok": S.redirect("/icon.png", 307),
        "/hop1": S.redirect("/hop2"), "/hop2": S.redirect("/hop3"), "/hop3": S.redirect("/hop4"), "/hop4": S.redirect("/icon.png"),
        "/loop": S.redirect("/loop"),
        "/big-declared.png": (200, {"Content-Type": "image/png", "Content-Length": str(500 * 1024 * 1024)}, H.PNG),
        "/big-streamed.png": (200, {"Content-Type": "image/png"}, S.endless),
        "/slow.png": (200, {"Content-Type": "image/png"}, S.drip),
        "/html-as-png": S.ok("image/png", b"<html><body>not an image</body></html>"),
        "/png-as-html": S.ok("text/html", H.PNG),
        "/key-as-icon": S.ok("image/x-icon", b"-----BEGIN OPENSSH PRIVATE KEY-----\n"),
        "/script-as-font": S.ok("font/woff2", b"#!/bin/sh\nid\n"),
        "/css-as-js": S.ok("application/javascript", b"alert(1)"),
        "/no-type": (200, {"Content-Length": str(len(H.PNG))}, H.PNG),
    }


class FetchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site = S.Site(SITE, routes())
        cls.internal = S.Site(INTERNAL, {"/secret": S.ok("image/png", H.PNG)})

    @classmethod
    def tearDownClass(cls):
        cls.site.stop()
        cls.internal.stop()

    def setUp(self):
        self.site.hits.clear()
        self.internal.hits.clear()
        self.policy = N.Policy(allow_origins=[BASE])

    def blocked(self, url: str, kind="image", policy=None, contains: str = "") -> str:
        policy = policy or self.policy
        before = len(policy.blocked)
        with self.assertRaises(N.Blocked) as caught:
            N.fetch(url, policy, kind)
        self.assertEqual(len(policy.blocked), before + 1, "every refusal is recorded")
        self.assertEqual(policy.blocked[-1]["url"], url[:300])
        self.assertIn(contains, policy.blocked[-1]["reason"])
        return policy.blocked[-1]["reason"]

    def test_nothing_private_is_reachable_by_default(self):
        policy = N.Policy()
        for url in (f"{BASE}/icon.png", f"http://localhost:{SITE}/icon.png", f"http://[::1]:{SITE}/icon.png", f"http://127.1:{SITE}/icon.png",
                    f"http://2130706433:{SITE}/icon.png", f"http://0x7f000001:{SITE}/icon.png", f"http://[::ffff:127.0.0.1]:{SITE}/icon.png",
                    f"http://0.0.0.0:{SITE}/icon.png", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/", "http://192.168.1.1/router",
                    "http://[fe80::1]/", "http://[fc00::1]/", "http://100.64.0.1/", "http://224.0.0.1/"):
            with self.subTest(url=url):
                self.blocked(url, policy=policy)
        self.assertEqual(self.site.hits, [])

    def test_only_http_and_https(self):
        for url in ("file:///etc/hosts", "file:///Users/someone/.ssh/id_rsa", "ftp://example.com/x.png", "gopher://example.com/", "javascript:alert(1)",
                    "data:image/png;base64,AAAA", "chrome://settings", "//example.com/x.png", "x.png", "", f"http://user:pw@127.0.0.1:{SITE}/icon.png",
                    f"http://127.0.0.1:{SITE}:1/x", "http://[::1/x"):
            with self.subTest(url=url):
                self.blocked(url)
        self.assertEqual(self.site.hits, [])

    def test_an_allowed_origin_serves_images_fonts_and_css(self):
        self.assertEqual(N.fetch(f"{BASE}/icon.png", self.policy, "image"), (H.PNG, "png"))
        self.assertEqual(N.fetch(f"{BASE}/logo.svg", self.policy, "image"), (H.SVG, "svg"))
        self.assertEqual(N.fetch(f"{BASE}/font.woff2", self.policy, "font"), (H.WOFF2, "woff2"))
        self.assertEqual(N.fetch(f"{BASE}/style.css", self.policy, "css")[1], "css")
        self.assertEqual(N.fetch(f"{BASE}/redirect-ok", self.policy, "image"), (H.PNG, "png"))
        self.assertEqual(self.policy.blocked, [])
        self.assertEqual(self.policy.total, len(H.PNG) * 2 + len(H.SVG) + len(H.WOFF2) + 18)

    def test_redirects_are_checked_at_every_hop(self):
        self.blocked(f"{BASE}/redirect-secret", contains="not a public address")
        self.blocked(f"{BASE}/redirect-localhost", contains="not a public address")
        self.blocked(f"{BASE}/redirect-metadata", contains="169.254.169.254")
        self.blocked(f"{BASE}/redirect-file", contains="only http and https")
        self.blocked(f"{BASE}/hop1", contains="redirects")
        self.blocked(f"{BASE}/loop", contains="redirects")
        self.assertEqual(self.internal.hits, [], "the internal service was never contacted")
        self.assertEqual(self.site.hits.count("/loop"), N.MAX_REDIRECTS + 1)

    def test_size_and_time_limits(self):
        self.blocked(f"{BASE}/big-declared.png", contains="byte limit")
        self.blocked(f"{BASE}/big-streamed.png", contains="byte limit")
        quick = N.Policy(allow_origins=[BASE], timeout=1.0)
        self.blocked(f"{BASE}/slow.png", policy=quick)
        budget = N.Policy(allow_origins=[BASE], max_total_bytes=len(H.PNG))
        N.fetch(f"{BASE}/icon.png", budget, "image")
        self.blocked(f"{BASE}/icon.png", policy=budget, contains="budget")
        self.assertEqual(N.fetch(f"{BASE}/icon.png", self.policy, "image", max_bytes=len(H.PNG))[0], H.PNG)
        with self.assertRaises(N.Blocked):
            N.fetch(f"{BASE}/icon.png", self.policy, "image", max_bytes=10)

    def test_content_type_and_first_bytes_must_agree(self):
        for path, kind in (("/html-as-png", "image"), ("/png-as-html", "image"), ("/key-as-icon", "image"), ("/no-type", "image"), ("/style.css", "image"),
                           ("/script-as-font", "font"), ("/icon.png", "font"), ("/css-as-js", "css"), ("/icon.png", "css")):
            with self.subTest(path=path, kind=kind):
                self.blocked(BASE + path, kind=kind)

    def test_the_connection_goes_to_the_address_that_was_checked(self):
        real = socket.getaddrinfo
        calls = []

        def rebinding(host, port, *args, **kwargs):
            if host == "rebind.test":
                calls.append(host)
                # First answer: the allowed test server. Every later answer: somewhere else.
                return real("127.0.0.1" if len(calls) == 1 else "127.0.0.2", port, *args, **kwargs)
            return real(host, port, *args, **kwargs)

        policy = N.Policy(allow_origins=[f"http://rebind.test:{SITE}"])
        with mock.patch("socket.getaddrinfo", rebinding):
            self.assertEqual(N.fetch(f"http://rebind.test:{SITE}/icon.png", policy, "image"), (H.PNG, "png"))
        self.assertEqual(calls, ["rebind.test"], "one lookup: the connection is not resolved a second time")

        def mixed(host, port, *args, **kwargs):
            if host == "mixed.test":
                return real("93.184.216.34", port, *args, **kwargs) + real("127.0.0.1", port, *args, **kwargs)
            return real(host, port, *args, **kwargs)

        with mock.patch("socket.getaddrinfo", mixed):
            self.blocked(f"http://mixed.test:{SITE}/icon.png", policy=N.Policy(), contains="127.0.0.1")
        self.assertEqual(self.site.hits, ["/icon.png"])

    def test_file_urls_only_inside_a_local_source_folder(self):
        folder = Path(tempfile.mkdtemp(prefix="brand-import-site-"))
        self.addCleanup(shutil.rmtree, folder, True)
        site, outside = folder / "site", folder / "outside"
        site.mkdir()
        outside.mkdir()
        (site / "logo.png").write_bytes(H.PNG)
        (site / "notes.txt").write_text("secret")
        (outside / "secret.png").write_bytes(H.PNG)
        os.symlink(outside / "secret.png", site / "link.png")
        local = N.Policy(local_root=site)
        self.assertEqual(N.fetch((site / "logo.png").as_uri(), local, "image"), (H.PNG, "png"))
        for url in ((outside / "secret.png").as_uri(), (site / "link.png").as_uri(), (site / "notes.txt").as_uri(), "file:///etc/hosts",
                    site.as_uri() + "/../outside/secret.png", "file://attacker.example/share/x.png", site.as_uri()):
            with self.subTest(url=url):
                self.blocked(url, policy=local)
        self.blocked((site / "logo.png").as_uri(), contains="local files are read only")


class ProxyTest(unittest.TestCase):
    """The proxy the browser is launched behind. Driven here with plain sockets; test_web_extract.py drives it with a browser."""

    @classmethod
    def setUpClass(cls):
        cls.site = S.Site(SITE, routes())
        cls.internal = S.Site(INTERNAL, {"/secret": S.ok("text/plain", b"internal")})
        cls.policy = N.Policy(allow_origins=[BASE])
        cls.proxy, cls.url = N.start_proxy(cls.policy, PROXY)

    @classmethod
    def tearDownClass(cls):
        cls.proxy.shutdown()
        cls.proxy.server_close()
        cls.site.stop()
        cls.internal.stop()

    def ask(self, request: bytes, then: bytes = b"") -> bytes:
        with socket.create_connection(("127.0.0.1", PROXY), 5) as sock:
            sock.sendall(request)
            if then:
                self.assertIn(b" 200 ", sock.recv(4096))
                sock.sendall(then)
            data = b""
            while True:
                chunk = sock.recv(65536)
                if not chunk:
                    return data
                data += chunk

    def test_plain_http_and_tunnels_reach_only_what_the_policy_allows(self):
        self.internal.hits.clear()
        self.assertEqual(self.url, f"http://127.0.0.1:{PROXY}")
        reply = self.ask(f"GET {BASE}/icon.png HTTP/1.1\r\nHost: 127.0.0.1:{SITE}\r\nProxy-Connection: keep-alive\r\n\r\n".encode())
        self.assertIn(b" 200 ", reply.split(b"\r\n", 1)[0])
        self.assertTrue(reply.endswith(H.PNG))
        tunnelled = self.ask(f"CONNECT 127.0.0.1:{SITE} HTTP/1.1\r\n\r\n".encode(), b"GET /icon.png HTTP/1.0\r\n\r\n")
        self.assertTrue(tunnelled.endswith(H.PNG))
        for request in (f"GET http://127.0.0.1:{INTERNAL}/secret HTTP/1.1\r\n\r\n", f"GET http://localhost:{INTERNAL}/secret HTTP/1.1\r\n\r\n",
                        f"CONNECT 127.0.0.1:{INTERNAL} HTTP/1.1\r\n\r\n", f"CONNECT localhost:{INTERNAL} HTTP/1.1\r\n\r\n", "CONNECT 169.254.169.254:80 HTTP/1.1\r\n\r\n",
                        "CONNECT [::1]:5961 HTTP/1.1\r\n\r\n", "GET http://169.254.169.254/latest/meta-data/ HTTP/1.1\r\n\r\n", "GET /secret HTTP/1.1\r\n\r\n",
                        "GET file:///etc/hosts HTTP/1.1\r\n\r\n", "GET ftp://127.0.0.1/x HTTP/1.1\r\n\r\n", "CONNECT 10.0.0.1:443 HTTP/1.1\r\n\r\n"):
            with self.subTest(request=request.split("\r\n")[0]):
                self.assertEqual(self.ask(request.encode()).split(b"\r\n", 1)[0], b"HTTP/1.1 403 Blocked")
        self.assertEqual(self.internal.hits, [])
        self.assertTrue(all(entry["by"] == "browser" for entry in self.policy.blocked))
        self.assertGreaterEqual(len(self.policy.blocked), 9)


class FontHostTest(unittest.TestCase):
    def test_hosts_are_compared_not_searched(self):
        extract_web = importlib.import_module("extract_web")
        classify = extract_web.classify_font_host
        self.assertEqual(classify("https://fonts.gstatic.com/s/inter/v13/x.woff2", "example.com")[0], "Google Fonts")
        self.assertEqual(classify("https://use.typekit.net/af/x.woff2", "example.com")[0], "Adobe Fonts")
        self.assertEqual(classify("https://cdn.jsdelivr.net/npm/@fontsource/inter/files/x.woff2", "example.com")[0], "Fontsource CDN")
        self.assertEqual(classify("https://www.fonts.com/x.woff2", "example.com")[0], "Monotype")
        self.assertEqual(classify("https://example.com/fonts/x.woff2", "example.com")[0], "self-hosted")
        for url in ("https://fonts.gstatic.com.attacker.example/x.woff2", "https://attacker.example/fonts.gstatic.com/x.woff2",
                    "https://attacker.example/x.woff2?from=fonts.googleapis.com", "https://fonts.gstatic.com@attacker.example/x.woff2",
                    "https://attacker.example/x.woff2#use.typekit.net", "https://evilfonts.com/x.woff2", "https://xrsms.me/x.woff2",
                    "https://cdn.jsdelivr.net/npm/evil/x.woff2", "https://attacker.example/cdn.jsdelivr.net/npm/@fontsource/x.woff2"):
            with self.subTest(url=url):
                name, note = classify(url, "example.com")
                self.assertNotIn(name, ("Google Fonts", "Adobe Fonts", "Fontsource CDN", "Monotype", "rsms (Inter)"))
                self.assertIn("Licence unknown", note)


if __name__ == "__main__":
    unittest.main()
