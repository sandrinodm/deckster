"""Item 4: the emitter copies only real font and logo files from inside the import folder, under its own
names, and adds only Fontsource packages as dependencies."""
from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

import _helpers as H



def files_under(folder: Path) -> list[str]:
    return sorted(str(p.relative_to(folder)) for p in folder.rglob("*") if p.is_file() or p.is_symlink())


class AssetTest(unittest.TestCase):
    def setUp(self):
        self.ws = H.Workspace()
        self.addCleanup(self.ws.close)
        self.outside = self.ws.root / "outside"
        self.outside.mkdir()
        (self.outside / "secret.woff2").write_bytes(H.WOFF2 + b"SECRET")
        (self.outside / "secret.png").write_bytes(H.PNG)
        (self.outside / "id_rsa").write_text("-----BEGIN OPENSSH PRIVATE KEY-----\n")

    def emit(self, d: dict):
        run = self.ws.emit(d)
        self.assertEqual(run.returncode, 0, run.stderr[-2000:])
        brand = H.read_brand(self.ws.brand_dir() / "brand.ts")
        return run, brand

    def font_draft(self, *paths) -> dict:
        d = H.draft()
        d["typography"]["families"]["body"]["source"] = {"kind": "files", "files": [{"path": p, "weight": 400} for p in paths]}
        return d

    def test_font_paths_outside_the_work_folder_are_not_copied(self):
        (self.ws.work / "fonts").mkdir()
        os.symlink(self.outside / "secret.woff2", self.ws.work / "fonts" / "link.woff2")
        os.symlink(self.outside, self.ws.work / "linkdir")
        (self.ws.work / "fonts" / "notes.woff2").write_text("not a font")
        (self.ws.work / "fonts" / "real.txt").write_bytes(H.WOFF2)
        hostile = ["../../../../../../../../etc/hosts", "/etc/hosts", str(self.outside / "secret.woff2"), "../../../outside/secret.woff2",
                   "fonts/link.woff2", "linkdir/secret.woff2", "fonts/notes.woff2", "fonts/real.txt", "fonts/missing.woff2", "fonts", "", "~/.ssh/id_rsa",
                   "../../../outside/id_rsa"]
        run, brand = self.emit(self.font_draft(*hostile))
        self.assertEqual(files_under(self.ws.brand_dir()), ["brand.ts", "import-notes.json"])
        self.assertEqual(brand["typography"]["families"]["body"]["source"]["kind"], "unavailable")
        self.assertEqual(run.stdout.count("font file not copied"), len(hostile))

    def test_a_real_font_inside_the_work_folder_is_copied_under_a_generated_name(self):
        (self.ws.work / "fonts").mkdir()
        (self.ws.work / "fonts" / "We ird';$(name).woff2").write_bytes(H.WOFF2)
        d = self.font_draft("fonts/We ird';$(name).woff2")
        d["typography"]["families"]["body"]["source"]["files"][0].update({"weight": 700, "style": "italic", "unicode_range": "U+0000-00FF, U+0131"})
        d["typography"]["families"]["body"]["source"]["files"].append({"path": "fonts/We ird';$(name).woff2", "weight": 700, "style": "italic", "unicode_range": "U+0; } body {"})
        _run, brand = self.emit(d)
        files = brand["typography"]["families"]["body"]["source"]["files"]
        self.assertEqual(files[0], {"path": "fonts/inter-700-italic.woff2", "weight": 700, "style": "italic", "unicodeRange": "U+0000-00FF, U+0131"})
        self.assertEqual(files[1], {"path": "fonts/inter-700-italic-2.woff2", "weight": 700, "style": "italic"})
        self.assertEqual((self.ws.brand_dir() / "fonts/inter-700-italic.woff2").read_bytes(), H.WOFF2)

    def test_logo_paths_are_contained_and_named_by_variant(self):
        (self.ws.work / "logos").mkdir()
        (self.ws.work / "logos" / "x y;z.png").write_bytes(H.PNG)
        (self.ws.work / "logos" / "fake.png").write_text("<html>")
        os.symlink(self.outside / "secret.png", self.ws.work / "logos" / "link.png")
        d = H.draft()
        d["logo"] = {"variants": [
            {"name": "Primary Mark", "file": "logos/x y;z.png", "on": ["default"]},
            {"name": "a", "file": "../../../outside/secret.png"}, {"name": "b", "file": str(self.outside / "secret.png")},
            {"name": "c", "file": "logos/link.png"}, {"name": "d", "file": "logos/fake.png"}, {"name": "e", "file": "/etc/hosts"},
            {"name": "f", "file": "../../../outside/id_rsa"},
        ]}
        _run, brand = self.emit(d)
        self.assertEqual(brand["logo"]["variants"], {"primary-mark": {"file": "logos/primary-mark.png", "aspect": 4}})
        self.assertEqual(files_under(self.ws.brand_dir()), ["brand.ts", "import-notes.json", "logos/primary-mark.png"])

    def test_an_svg_logo_is_sanitised_on_the_way_in(self):
        (self.ws.work / "logo.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10" onload="alert(1)"><script>alert(2)</script>'
            '<image href="https://attacker.example/x.png"/><path d="M0 0h40v10H0z" fill="#111"/></svg>')
        d = H.draft()
        d["logo"] = {"variants": [{"name": "primary", "file": "logo.svg"}]}
        run, brand = self.emit(d)
        written = (self.ws.brand_dir() / "logos/primary.svg").read_text()
        for bad in ("script", "onload", "attacker", "image"):
            self.assertNotIn(bad, written)
        self.assertIn("<path", written)
        self.assertEqual(brand["logo"]["variants"]["primary"]["aspect"], 4)
        self.assertIn("sanitised", run.stdout)

    def test_only_fontsource_packages_become_dependencies(self):
        for package in ("left-pad", "@evil/inter", "@fontsource/../../evil", "@fontsource/inter@npm:evil", "@fontsource/Inter", "https://attacker.example/x.tgz",
                        "@fontsource/inter\n", {"a": 1}):
            with self.subTest(package=package):
                d = H.draft()
                d["typography"]["families"]["body"]["source"] = {"kind": "fontsource", "package": package}
                run, brand = self.emit(d)
                self.assertNotIn("npm install", run.stdout)
                self.assertEqual(brand["typography"]["families"]["body"]["source"]["kind"], "unavailable")
                self.assertIn("not a Fontsource package", run.stdout)
        d = H.draft()
        d["typography"]["families"]["body"]["source"] = {"kind": "fontsource", "package": "@fontsource-variable/inter"}
        run, brand = self.emit(d)
        self.assertIn("npm install @fontsource-variable/inter@", run.stdout)
        self.assertEqual(brand["typography"]["families"]["body"]["source"], {"kind": "fontsource", "package": "@fontsource-variable/inter"})


if __name__ == "__main__":
    unittest.main()
