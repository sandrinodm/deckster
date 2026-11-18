"""Brand layouts from a template: canvas rules, type steps, fallback choice, checks, the probe and the emitter."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from _helpers import HERE, SCRIPTS, SVG, Workspace, draft  # noqa: F401

import _layout_probe as LP  # noqa: E402
import _layouts as L  # noqa: E402
import _tsdata  # noqa: E402

SKILL = HERE.parent.parent
spec = importlib.util.spec_from_file_location("make_template", SKILL / "evals/fixtures/make_template.py")
make_template = importlib.util.module_from_spec(spec)
spec.loader.exec_module(make_template)

try:
    import numpy  # noqa: F401
    import PIL  # noqa: F401

    HAVE_EXTRACT_DEPS = True
except ImportError:
    HAVE_EXTRACT_DEPS = False


def catalog() -> dict:
    def lay(name, slots, fields=None, title=True):
        return {"name": name, "source": "@deckster/kit", "title": {"required": True, "maxChars": 40} if title else None,
                "slots": {k: {"required": r, "accepts": a} for k, (r, a) in slots.items()},
                "fields": {f: {"required": False} for f in (fields or [])}}

    return {x["name"]: x for x in (
        lay("title", {"body": (False, ["text"]), "media": (False, ["image"])}, ["eyebrow", "byline"]),
        lay("section", {"body": (False, ["text"]), "media": (False, ["image"])}, ["eyebrow"]),
        lay("content", {"body": (True, ["text", "bullets", "table"]), "aside": (False, ["text"]), "footnote": (False, ["text"])}, ["eyebrow"]),
        lay("split", {"body": (True, ["text"]), "media": (True, ["image", "chart"]), "caption": (False, ["text"])}),
        lay("default", {"body": (True, ["text"])}, title=False),
        lay("stats", {"body": (False, ["text"])}, ["stats"]),
    )}


class Fixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="brand-layouts-test-"))
        make_template.main_build(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        import shutil

        shutil.rmtree(cls.tmp, ignore_errors=True)

    def extract(self, name: str) -> dict:
        out = self.tmp / ("x-" + name)
        run = subprocess.run([sys.executable, "-I", str(SCRIPTS / "extract_pptx.py"), str(self.tmp / name), "--out", str(out), "--no-render"], capture_output=True, text=True, timeout=120)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        return json.loads((out / "extraction.json").read_text())


class CanvasAndSteps(unittest.TestCase):
    SRC16 = {"page_size": {"width_pt": 960, "height_pt": 540}}
    SRC43 = {"page_size": {"width_pt": 720, "height_pt": 540}}

    def test_native(self):
        plan = L.plan_canvas(self.SRC16)
        self.assertTrue(plan["native"])
        self.assertEqual(L.to_box(plan, [0.1, 0.2, 0.5, 0.25]), [192, 216, 960, 270])
        self.assertEqual(L.to_px(plan, 18), 36)

    def test_four_by_three_uniform_is_centred(self):
        plan = L.plan_canvas(self.SRC43)
        self.assertEqual(plan["rule"], "uniform")
        self.assertEqual(L.to_box(plan, [0, 0, 1, 1]), [240, 0, 1440, 1080])
        self.assertEqual(L.to_px(plan, 18), 36)

    def test_four_by_three_stretch(self):
        plan = L.plan_canvas(self.SRC43)
        self.assertEqual(L.to_box(plan, [0, 0, 1, 1], "stretch"), [0, 0, 1920, 1080])
        self.assertAlmostEqual(L.to_px(plan, 18, "stretch"), 48)

    def test_boxes_stay_inside_the_canvas_and_over_the_minimum(self):
        plan = L.plan_canvas(self.SRC16)
        x, y, w, h = L.to_box(plan, [0.99, 0.99, 0.0, 0.0])
        self.assertTrue(w >= 40 and h >= 40 and x + w <= 1920 and y + h <= 1080)

    def test_nearest_step_and_the_15_percent_rule(self):
        steps = {"display": 112, "headline": 80, "title": 56, "body": 32, "caption": 22, "label": 20}
        self.assertEqual(L.snap_step(78, steps, "title")[0], "headline")
        self.assertEqual(L.snap_step(34, steps, "text")[0], "body")
        step, diff = L.snap_step(40, steps, "text")
        self.assertIsNone(step)
        self.assertGreater(diff, 0.15)


class Propose(Fixture):
    def propose(self, name="template.potx", rule="auto"):
        ex = self.extract(name)
        for l in ex["layouts"]:  # without a renderer there is no rendered background: say what the probe would have found
            l["art"] = {"background": "#0E1116" if l["master_index"] == 2 else "#FFFFFF", "has_art": False}
        dr = draft()
        dr["color"]["surfaces"] = {"default": {"bg": "#FFFFFF", "fg": "#1B1B1F"}, "inverse": {"bg": "#0E1116", "fg": "#F5F5F7"}}
        dr["typography"]["scale"] = {"display": {"size": 112}, "h1": {"size": 80}, "h2": {"size": 56}, "body": {"size": 32}, "label": {"size": 20}}
        return ex, L.propose(ex, catalog(), dr, "acme", rule)

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_every_layout_is_listed_used_or_not(self):
        ex = self.extract("template.potx")
        self.assertEqual(len(ex["layouts"]), 13)
        self.assertEqual(len({l["key"] for l in ex["layouts"]}), 13)
        self.assertTrue(all(l["unused"] for l in ex["layouts"]))

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_specs_bind_and_pass_the_catalog_rules(self):
        ex, (specs, notes) = self.propose()
        by = {s["key"]: s for s in specs}
        # the same-named layouts with the same geometry are one layout with art per surface; the one with other geometry is kept apart
        self.assertNotIn("m2/slideLayout11", by)
        self.assertEqual(by["m1/slideLayout2"]["keys"], ["m1/slideLayout2", "m2/slideLayout11"])
        self.assertEqual([x["surface"] for x in by["m1/slideLayout2"]["sources"]], ["default", "inverse"])
        names = [s["name"] for s in specs]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn("title-slide-nightfall", names)
        self.assertEqual(by["m1/slideLayout1"]["fallback"], "title")
        self.assertEqual(by["m1/slideLayout3"]["fallback"], "content")
        self.assertEqual([r["bind"] for r in by["m1/slideLayout3"]["regions"]], [{"slot": "body"}, {"slot": "aside"}])
        pic = by["m1/slideLayout5"]
        self.assertEqual(pic["fallback"], "split")
        self.assertIn({"slot": "media"}, [r["bind"] for r in pic["regions"]])
        self.assertEqual(by["m1/slideLayout1"]["title"]["type"], "display")  # 54 pt = 108 px, 3.6% from display
        self.assertEqual(by["m1/slideLayout7"]["source"]["placeholders"], {"title": 0, "slot:body": 1, "slot:aside": 13})
        self.assertIn("Describe the key result", by["m1/slideLayout7"]["description"])
        # the blank layout needs the fallback's body: it is made up and said so
        blank = by["m2/slideLayout13"]
        self.assertEqual(blank["title"], False)
        self.assertFalse(blank["keep"])  # no art in this test, and a made-up body only
        self.assertTrue(any("body region was added" in n for n in blank["notes"]))
        errors, _ = L.check_specs(specs, catalog(), {"default", "inverse"})
        self.assertEqual(errors, [])

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_a_background_no_surface_has_is_kept_in_the_art_on_the_matching_polarity(self):
        ex = self.extract("template.potx")
        for l in ex["layouts"]:
            l["art"] = {"background": "#FFFFFF", "has_art": False, "svg_with_background": f"layouts/{l['file_key']}-bg.svg"}
        sec = next(l for l in ex["layouts"] if l["key"] == "m1/slideLayout4")
        sec["art"]["background"] = "#0B2545"  # navy: dark, but not the inverse surface's #0E1116
        dr = draft()
        dr["color"]["surfaces"] = {"default": {"bg": "#FFFFFF", "fg": "#1B1B1F"}, "inverse": {"bg": "#0E1116", "fg": "#F5F5F7"}}
        specs, _ = L.propose(ex, catalog(), dr, "acme")
        spec = next(s for s in specs if s["key"] == "m1/slideLayout4")
        self.assertEqual(spec["surface"], "inverse")
        self.assertEqual(spec["background"], {"inverse": [{"source": "layouts/m1-slideLayout4-bg.svg", "fit": "cover"}]})
        self.assertTrue(any("kept in the art" in n for n in spec["notes"]))
        plain = next(s for s in specs if s["key"] == "m1/slideLayout2")
        self.assertNotIn("background", plain)

    def test_surface_choice_follows_polarity(self):
        surfaces = {"default": {"bg": "#FFFFFF"}, "inverse": {"bg": "#0E1116"}}
        self.assertEqual(L.surface_for("#7A1F1F", surfaces)[0], "inverse")  # dark red: nearer to white by distance, but dark
        self.assertEqual(L.surface_for("#EEEEAA", surfaces)[0], "default")

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_footer_follows_the_footer_placeholder(self):
        ex = self.extract("template.potx")
        for l in ex["layouts"]:
            l["art"] = {"background": "#FFFFFF", "has_art": False}
        ex["layouts"][1]["placeholders"] = [p for p in ex["layouts"][1]["placeholders"] if p["type"] != "ftr"]
        dr = draft()
        dr["chrome"] = {"footer": "Acme"}
        specs, _ = L.propose(ex, catalog(), dr, "acme")
        by = {s["key"]: s for s in specs}
        self.assertEqual(by[ex["layouts"][1]["key"]]["chrome"]["footer"], False)
        self.assertNotIn("footer", by[ex["layouts"][0]["key"]].get("chrome", {}))
        specs, _ = L.propose(ex, catalog(), draft(), "acme")  # the brand shows no footer: nothing to hide
        self.assertTrue(all("footer" not in s.get("chrome", {}) for s in specs))

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_name_clash_gets_the_brand_prefix(self):
        ex = self.extract("template.potx")
        ex["layouts"][8]["name"] = "Section"  # Title Only, whose kebab form is a kit layout
        specs, _ = L.propose(ex, catalog(), draft(), "acme")
        self.assertIn("acme-section", [s["name"] for s in specs])

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_four_by_three_boxes_are_centred(self):
        ex, (specs, _) = self.propose("template-4x3.potx")
        two = next(s for s in specs if s["key"] == "m1/slideLayout3")
        self.assertEqual(two["aspect_rule"], "uniform")
        for r in two["regions"]:
            self.assertGreaterEqual(r["box"][0], 240)
            self.assertLessEqual(r["box"][0] + r["box"][2], 1680)

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_a_deckster_package_gives_no_layouts(self):
        for name in ("template-deckster.pptx", "template-deckster-old.pptx"):  # Application: deckster, and the older: deck
            ex = self.extract(name)
            self.assertTrue(ex["source"]["generator"]["deckster"], name)
            self.assertEqual(L.propose(ex, catalog(), draft(), "acme")[0], [])

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_a_real_package_is_not_taken_for_one(self):
        self.assertFalse(self.extract("template.potx")["source"]["generator"]["deckster"])


class Checks(unittest.TestCase):
    def spec(self, **kw):
        base = {"name": "two-up", "description": "Two columns.", "fallback": "content", "title": {"box": [100, 80, 1600, 140]},
                "regions": [{"bind": {"slot": "body"}, "box": [100, 260, 800, 600]}, {"bind": {"slot": "aside"}, "box": [1000, 260, 800, 600]}]}
        base.update(kw)
        return base

    def errors(self, **kw):
        return L.check_specs([self.spec(**kw)], catalog(), {"default"})[0]

    def test_valid(self):
        self.assertEqual(self.errors(), [])

    def test_note_style_entries_are_not_specs(self):
        self.assertEqual(L.check_specs([{"archetype": "title", "maps_to": "title"}], catalog(), {"default"}), ([], []))

    def test_each_rule(self):
        self.assertTrue(any("no slot" in e for e in self.errors(regions=[{"bind": {"slot": "nope"}, "box": [0, 0, 100, 100]}])))
        self.assertTrue(any("requires slot 'body'" in e for e in self.errors(regions=[{"bind": {"slot": "aside"}, "box": [0, 0, 100, 100]}])))
        self.assertTrue(any("leaves the" in e for e in self.errors(regions=[{"bind": {"slot": "body"}, "box": [1900, 0, 100, 100]}])))
        self.assertTrue(any("minimum" in e for e in self.errors(regions=[{"bind": {"slot": "body"}, "box": [0, 0, 10, 100]}])))
        self.assertTrue(any("requires a title" in e for e in self.errors(title=False)))
        self.assertTrue(any("already a layout" in e for e in self.errors(name="content")))
        self.assertTrue(any("kebab" in e for e in self.errors(name="Two Up")))
        self.assertTrue(any("not a kit" in e for e in self.errors(fallback="contnet")))
        self.assertTrue(any("not a surface" in e for e in self.errors(surface="night")))
        self.assertTrue(any("type step" in e for e in self.errors(title={"box": [100, 80, 1600, 140], "type": "huge"})))
        self.assertTrue(any("only to a media region" in e for e in self.errors(regions=[{"bind": {"slot": "body"}, "box": [0, 0, 100, 100], "fit": "cover"}])))

    def test_dropped_layouts_are_not_checked(self):
        self.assertEqual(L.check_specs([self.spec(fallback="nope", keep=False)], catalog(), {"default"})[0], [])


class Probe(Fixture):
    def test_potx_becomes_a_presentation_without_macros(self):
        out = self.tmp / "plain.pptx"
        LP.to_presentation(self.tmp / "template.potx", out)
        with zipfile.ZipFile(out) as z:
            ct = z.read("[Content_Types].xml").decode()
        self.assertIn(LP.PRESENTATION_TYPE, ct)
        self.assertNotIn("template.main+xml", ct)

    def test_macro_enabled_type_is_rewritten_by_part_name_and_vba_dropped(self):
        src = self.tmp / "macro.pptm"
        with zipfile.ZipFile(self.tmp / "template.pptx") as zin, zipfile.ZipFile(src, "w") as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename == "[Content_Types].xml":
                    data = data.decode().replace(LP.PRESENTATION_TYPE, "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml").replace("</Types>", '<Override PartName="/ppt/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>').encode()
                if info.filename == "ppt/_rels/presentation.xml.rels":
                    data = data.decode().replace("</Relationships>", '<Relationship Id="rIdV" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>').encode()
                zout.writestr(info, data)
            zout.writestr("ppt/vbaProject.bin", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1 macro")
        out = self.tmp / "macro-plain.pptx"
        notes = LP.to_presentation(src, out)
        with zipfile.ZipFile(out) as z:
            self.assertNotIn("ppt/vbaProject.bin", z.namelist())
            self.assertIn(LP.PRESENTATION_TYPE, z.read("[Content_Types].xml").decode())
            self.assertNotIn("vbaProject", z.read("ppt/_rels/presentation.xml.rels").decode())
        self.assertTrue(any("VBA" in n for n in notes))

    def layouts(self):
        out = []
        with zipfile.ZipFile(self.tmp / "template.pptx") as z:
            parts = sorted((n for n in z.namelist() if n.startswith("ppt/slideLayouts/slideLayout") and n.endswith(".xml")), key=lambda n: int(n.rsplit("t", 1)[-1][:-4]))
        for part in parts:
            out.append({"part": part, "placeholders": [{"type": "title", "type_declared": "title", "idx": "0", "idx_declared": None, "name": "Title 1"}, {"type": "pic", "type_declared": "pic", "idx": "1", "idx_declared": "1", "name": "Pic", "has_custom_prompt": False},
                                                      {"type": "body", "type_declared": "body", "idx": "2", "idx_declared": "2", "name": "Body", "has_custom_prompt": True, "prompt": "Say <this> & that"}]})
        return out

    def test_probe_has_one_slide_per_layout_and_well_formed_xml(self):
        base = self.tmp / "base.pptx"
        LP.to_presentation(self.tmp / "template.potx", base)
        layouts = self.layouts()
        for variant in ("art", "filled"):
            dst = self.tmp / f"{variant}.pptx"
            made = LP.build_probe(base, dst, layouts, variant)
            self.assertEqual(made["slides"], 13)
            self.assertEqual(made["group_placeholders_removed"], 1)
            with zipfile.ZipFile(dst) as z:
                for name in z.namelist():
                    if name.endswith((".xml", ".rels")):
                        ET.fromstring(z.read(name))
                slides = [n for n in z.namelist() if n.startswith("ppt/slides/slide")]
                self.assertEqual(len(slides), 13)
                pres = z.read("ppt/presentation.xml").decode()
                self.assertEqual(pres.count("<p:sldId "), 13)
                self.assertLess(pres.index("sldIdLst"), pres.index("<p:sldSz"))
                filled = z.read("ppt/slides/slide1.xml").decode()
                layout8 = z.read("ppt/slideLayouts/slideLayout8.xml").decode()
            if variant == "art":
                self.assertNotIn("<p:sp>", filled)
            else:
                self.assertIn("Say &lt;this&gt; &amp; that", filled)
                self.assertIn('type="pic"', filled)
            self.assertNotIn("Content Placeholder 1", layout8)  # the group's placeholder was removed

    def test_strip_svg_removes_leading_page_rectangles_only(self):
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960pt" height="540pt" viewBox="0 0 960 540">'
               '<defs><clipPath id="c"><path d="M 0 0 L 960 0 L 960 540 L 0 540 Z"/></clipPath></defs>'
               '<path fill="rgb(100%, 100%, 100%)" d="M 0 0 L 960 0 L 960 540 L 0 540 Z M 0 0 "/>'
               '<rect x="-96" y="-54" width="1152" height="648" fill="rgb(4.3%, 14.5%, 27.1%)"/>'
               '<path fill="#ff0000" d="M 0 0 L 40 0 L 40 540 L 0 540 Z"/>'
               '<path fill="#ffffff" d="M 0 0 L 960 0 L 960 540 L 0 540 Z"/></svg>')
        src, dst = self.tmp / "a.svg", self.tmp / "b.svg"
        src.write_text(svg)
        info = LP.strip_svg(src, dst)
        self.assertEqual(info["removed"], 2)
        self.assertEqual(info["background"], "#0B2545")
        self.assertTrue(info["has_art"])
        self.assertEqual(dst.read_text().count("<path"), 3)  # the clip path, the red strip, and a later full-page rect that is art

    def test_empty_art(self):
        src, dst = self.tmp / "e.svg", self.tmp / "e2.svg"
        src.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="960pt" height="540pt" viewBox="0 0 960 540"><rect x="0" y="0" width="960" height="540" fill="#ffffff"/></svg>')
        self.assertFalse(LP.strip_svg(src, dst)["has_art"])


class Emit(unittest.TestCase):
    def setUp(self):
        self.ws = Workspace()
        (self.ws.work / "layouts").mkdir()
        (self.ws.work / "layouts" / "a.svg").write_bytes(SVG)

    def tearDown(self):
        self.ws.close()

    def spec(self, name="two-up", **kw):
        base = {"key": "m1/slideLayout2", "name": name, "label": "Two Up", "description": "Two columns.", "fallback": "content", "surface": "default",
                "title": {"box": [100, 80, 1600, 140], "type": "display"},
                "regions": [{"bind": {"slot": "body"}, "box": [100, 260, 1600, 600]}],
                "background": {"default": [{"source": "layouts/a.svg", "fit": "cover"}]}, "keep": True, "notes": ["a note"]}
        base.update(kw)
        return base

    def emit(self, *specs):
        d = draft()
        d["layouts"] = [{"archetype": "x", "maps_to": "title"}, *specs]
        return self.ws.emit(d)

    def test_writes_layouts_ts_and_art_and_leaves_out_dropped(self):
        run = self.emit(self.spec(), self.spec("dropped", keep=False, fallback=None))
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        brand = self.ws.brand_dir()
        value = _tsdata.read_module((brand / "layouts.ts").read_text(encoding="utf-8"), _tsdata.LAYOUTS_HEADER, list)
        self.assertEqual([v["name"] for v in value], ["two-up"])
        self.assertEqual(value[0]["background"], {"default": [{"type": "image", "file": "layouts/two-up-default.svg", "fit": "cover"}]})
        self.assertTrue((brand / "layouts/two-up-default.svg").is_file())
        self.assertNotIn("keep", value[0])
        notes = json.loads((brand / "import-notes.json").read_text())
        self.assertEqual([l["name"] for l in notes["layouts"] if l["kept"]], ["two-up"])

    def test_source_text_cannot_become_code(self):
        evil = "*/ import('fs'); // `${1}`"
        run = self.emit(self.spec(label=evil, description=evil))
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        text = (self.ws.brand_dir() / "layouts.ts").read_text(encoding="utf-8")
        value = _tsdata.read_module(text, _tsdata.LAYOUTS_HEADER, list)
        self.assertIn("import('fs')", value[0]["label"])
        self.assertEqual([l for l in text.splitlines() if l.startswith("import ")], ["import { defineBrandLayouts } from '@deckster/brand';"])

    def test_art_path_outside_the_draft_is_refused(self):
        run = self.emit(self.spec(background={"default": [{"source": "../../etc/passwd.svg", "fit": "cover"}]}))
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn("art file not copied", run.stdout)
        self.assertFalse((self.ws.brand_dir() / "layouts").exists() and any((self.ws.brand_dir() / "layouts").iterdir()))

    def test_no_fallback_stops_the_run(self):
        run = self.emit(self.spec(fallback=None))
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("Nothing was written", run.stdout + run.stderr)

    def test_reemit_replaces_old_art(self):
        self.emit(self.spec())
        self.assertTrue((self.ws.brand_dir() / "layouts/two-up-default.svg").is_file())
        self.emit(self.spec("other"))
        self.assertFalse((self.ws.brand_dir() / "layouts/two-up-default.svg").exists())
        self.assertTrue((self.ws.brand_dir() / "layouts/other-default.svg").is_file())


if __name__ == "__main__":
    unittest.main()


# ---------------------------------------------------------------------------- review fixes


import base64  # noqa: E402
import os  # noqa: E402
import shutil  # noqa: E402
import _filesafe as F  # noqa: E402
from _helpers import PNG, repo_root  # noqa: E402


def valid_png(width: int = 8, height: int = 4) -> bytes:
    import struct  # noqa: PLC0415
    import zlib  # noqa: PLC0415

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

    rows = b"".join(b"\x00" + b"\xc8\x1e\x3c" * width for _ in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def data_png() -> str:
    return "data:image/png;base64," + base64.b64encode(valid_png()).decode()


def svg_with(*body: str) -> bytes:
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960pt" height="540pt" viewBox="0 0 960 540">'
            + "".join(body) + "</svg>").encode()


class ArtPictures(unittest.TestCase):
    def test_an_embedded_png_survives_and_anything_else_does_not(self):
        keep = svg_with(f'<image width="30" height="10" xlink:href="{data_png()}"/>')
        out, removed = F.sanitize_svg(keep, allow_images=True)
        self.assertIn(b"<image", out)
        self.assertEqual(removed, [])
        self.assertIn(b"data:image/png;base64,", out)
        for bad in ('<image width="3" height="3" xlink:href="https://evil.example/a.png"/>',
                    '<image width="3" height="3" xlink:href="data:image/svg+xml;base64,PHN2Zy8+"/>',
                    '<image width="3" height="3" xlink:href="data:image/png;base64,bm90IGEgcG5n"/>',
                    '<image width="3" height="3" xlink:href="file:///etc/passwd"/>'):
            out, removed = F.sanitize_svg(svg_with(bad, '<path d="M0 0h5v5z"/>'), allow_images=True)
            self.assertNotIn(b"<image", out, bad)
            self.assertIn("<image>", removed)
        out, removed = F.sanitize_svg(svg_with(f'<image width="3" height="3" xlink:href="{data_png()}"/>', '<path d="M0 0h5v5z"/>'))
        self.assertNotIn(b"<image", out)  # logos are still sanitised without pictures

    def test_logo_false_is_dropped_when_the_picture_did_not_survive(self):
        ws = Workspace()
        try:
            (ws.work / "layouts").mkdir()
            (ws.work / "layouts" / "a.svg").write_bytes(svg_with('<image width="3" height="3" xlink:href="https://evil.example/a.png"/>', '<path d="M0 0h5v5z" fill="#f00"/>'))
            (ws.work / "layouts" / "b.svg").write_bytes(svg_with(f'<image width="3" height="3" xlink:href="{data_png()}"/>', '<path d="M0 0h5v5z" fill="#f00"/>'))
            base = {"description": "x", "fallback": "content", "title": {"box": [100, 80, 1600, 140]}, "regions": [{"bind": {"slot": "body"}, "box": [100, 260, 1600, 600]}],
                    "chrome": {"logo": False}, "logo_in_art": True, "keep": True}
            d = draft()
            d["layouts"] = [{**base, "name": "lost", "background": {"default": [{"source": "layouts/a.svg"}]}}, {**base, "name": "kept", "background": {"default": [{"source": "layouts/b.svg"}]}}]
            run = ws.emit(d)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            value = {v["name"]: v for v in _tsdata.read_module((ws.brand_dir() / "layouts.ts").read_text(encoding="utf-8"), _tsdata.LAYOUTS_HEADER, list)}
            self.assertNotIn("chrome", value["lost"])
            self.assertEqual(value["kept"]["chrome"], {"logo": False})
            self.assertIn(b"<image", (ws.brand_dir() / "layouts/kept-default.svg").read_bytes())
        finally:
            ws.close()

    def test_gradient_page_fill_is_art_not_a_background(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            src, dst = tmp / "g.svg", tmp / "o.svg"
            src.write_bytes(svg_with('<defs><linearGradient id="g"><stop offset="0" stop-color="#101840"/></linearGradient></defs>',
                                     '<path fill="rgb(100%, 100%, 100%)" d="M 0 0 L 960 0 L 960 540 L 0 540 Z"/>', '<path fill="url(#g)" d="M 0 0 L 960 0 L 960 540 L 0 540 Z"/>'))
            info = LP.strip_svg(src, dst)
            self.assertEqual(info["removed"], 1)
            self.assertEqual(info["page_fill"], "gradient")
            self.assertTrue(info["has_art"])
            src.write_bytes(svg_with('<path fill="#fff" d="M 0 0 L 960 0 L 960 540 L 0 540 Z"/>', f'<image x="0" y="0" width="960" height="540" xlink:href="{data_png()}"/>'))
            self.assertEqual(LP.strip_svg(src, dst)["page_fill"], "picture")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


def stats_catalog() -> dict:
    cat = catalog()
    cat["stats"]["frontmatter"] = {"properties": {"stats": {"type": "array", "items": {"type": "object"}}, "eyebrow": {"type": "string"}}}
    cat["stats"]["fields"] = {"stats": {"required": True}, "eyebrow": {"required": False}}
    cat["content"]["frontmatter"] = {"properties": {"eyebrow": {"type": "string"}, "width": {"anyOf": [{"type": "string"}, {"type": "number"}]}}}
    return cat


class StructuredFields(unittest.TestCase):
    def spec(self, **kw):
        base = {"name": "numbers", "description": "x", "fallback": "stats", "title": {"box": [100, 80, 1600, 140]}, "regions": []}
        base.update(kw)
        return base

    def test_text_field_rule(self):
        cat = stats_catalog()
        self.assertFalse(L.is_text_field(cat["stats"], "stats"))
        self.assertTrue(L.is_text_field(cat["stats"], "eyebrow"))
        self.assertTrue(L.is_text_field(cat["content"], "width"))

    def test_required_structured_field_must_be_listed_in_fields(self):
        cat = stats_catalog()
        errors = L.check_specs([self.spec()], cat, {"default"})[0]
        self.assertTrue(any("structured field 'stats'" in e for e in errors), errors)
        self.assertEqual(L.check_specs([self.spec(fields=["stats"])], cat, {"default"})[0], [])
        bound = L.check_specs([self.spec(regions=[{"bind": {"field": "stats"}, "box": [0, 0, 100, 100]}])], cat, {"default"})[0]
        self.assertTrue(any("not a string or a number" in e for e in bound), bound)
        self.assertTrue(any("has no field 'nope'" in e for e in L.check_specs([self.spec(fields=["stats", "nope"])], cat, {"default"})[0]))

    def test_error_paths_use_the_drafts_index(self):
        errors = L.check_specs([{"archetype": "x"}, self.spec(fallback="nope")], stats_catalog(), {"default"})[0]
        self.assertTrue(errors[0].startswith("layouts[1]"), errors)

    def test_camel_case_slot_names(self):
        spec = self.spec(fallback="content", regions=[{"bind": {"slot": "pullQuote"}, "box": [0, 0, 100, 100]}])
        errors = L.check_specs([spec], stats_catalog(), {"default"})[0]
        self.assertFalse(any("not a valid name" in e for e in errors), errors)

    def test_emitted_with_fields(self):
        value = L.spec_to_module_value(self.spec(fields=["stats"]))
        self.assertEqual(value["fields"], ["stats"])

    @unittest.skipUnless(HAVE_EXTRACT_DEPS, "numpy and pillow are needed to run the extractor")
    def test_propose_takes_a_structured_fallback_only_when_nothing_simpler_fits(self):
        # a title-only layout still prefers section (no fields) over stats
        ex = Fixture.__new__(Fixture)  # not a TestCase run: reuse the helper below
        tmp = Path(tempfile.mkdtemp())
        try:
            make_template.main_build(tmp)
            run = subprocess.run([sys.executable, "-I", "-B", str(SCRIPTS / "extract_pptx.py"), str(tmp / "template.potx"), "--out", str(tmp / "x"), "--no-render"], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            extraction = json.loads((tmp / "x/extraction.json").read_text())
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        cat = stats_catalog()
        for name in ("content", "split", "default", "title", "section"):
            cat.pop(name)  # only stats is left: title-only layouts must take its structured field
        specs, _ = L.propose(extraction, cat, draft(), "acme")
        title_only = next(s for s in specs if s["key"] == "m1/slideLayout9")
        self.assertEqual(title_only["fallback"], "stats")
        self.assertEqual(title_only["fields"], ["stats"])
        self.assertEqual(L.check_specs([title_only], cat, {"default"})[0], [])


class OnExtractions(Fixture):
    def make(self, name: str, how: str) -> str:
        src = self.tmp / name
        getattr(make_template, how)(self.tmp / "template.pptx", src, *([PNG] if how == "add_logo" else []))
        return name

    def test_deckster_application_is_decisive_whatever_the_version(self):
        for app, version, expected in (("deckster", "1.2.3", True), ("deckster", None, True), ("deck", None, True), ("deck", "16.0", False), ("Microsoft Office PowerPoint", None, False)):
            make_template.build(self.tmp / "d.pptx", 12192000, application=app, app_version=version)
            self.assertEqual(self.extract("d.pptx")["source"]["generator"]["deckster"], expected, (app, version))

    def test_a_nameless_layout_is_imported_and_analysed(self):
        name = self.make("nn.potx", "remove_layout_name")
        ex = self.extract(name)
        self.assertIsNone(next(l for l in ex["layouts"] if l["key"] == "m1/slideLayout9")["name"])
        specs, _ = L.propose(ex, catalog(), draft(), "acme")
        self.assertIn("layout-m1-slidelayout9", [s["name"] for s in specs])
        run = subprocess.run([sys.executable, "-I", "-B", str(SCRIPTS / "brand_tools.py"), "analyze", str(self.tmp / "x-nn.potx/extraction.json"), "--offline"], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)

    def test_without_renders_the_masters_background_sets_the_surface_and_merges_duplicates(self):
        ex = self.extract("template.potx")  # --no-render: no art at all
        self.assertTrue(all("art" not in l for l in ex["layouts"]))
        dr = draft()
        dr["color"]["surfaces"] = {"default": {"bg": "#FFFFFF"}, "inverse": {"bg": "#0E1116"}}
        specs, _ = L.propose(ex, catalog(), dr, "acme")
        by = {s["key"]: s for s in specs}
        self.assertEqual(by["m2/slideLayout10"]["surface"], "inverse")
        self.assertEqual([x["surface"] for x in by["m1/slideLayout2"]["sources"]], ["default", "inverse"])

    def test_a_catalog_that_has_the_brands_own_layouts_changes_nothing(self):
        ex = self.extract("template.potx")
        plain, _ = L.propose(ex, catalog(), draft(), "acme")
        cat = catalog()
        cat["title-and-content"] = {**cat["content"], "name": "title-and-content", "source": "brand:acme"}
        again, _ = L.propose(ex, cat, draft(), "acme")
        self.assertEqual([s["name"] for s in plain], [s["name"] for s in again])
        self.assertEqual(L.check_specs(plain[:2], cat, {"default"})[0], L.check_specs(plain[:2], catalog(), {"default"})[0])

    def test_fewer_things_made_up_beats_a_closer_name(self):
        ex = self.extract("template.potx")
        lo = next(l for l in ex["layouts"] if l["key"] == "m1/slideLayout5")
        lo["placeholders"] = [p for p in lo["placeholders"] if p["type"] != "body"]  # title + picture, no caption
        name, bound, _ = L.choose_fallback(lo, L.kit_layouts(catalog()), [])
        self.assertEqual(bound["synthesized"], [])
        self.assertNotEqual(name, "split")  # split would need a body made up over the picture

    def test_text_never_snaps_to_a_heading_step(self):
        steps = {"display": 112, "headline": 80, "title": 56, "body": 32, "label": 20}
        step, diff = L.snap_step(56, steps, "text")
        self.assertIsNone(step)
        self.assertGreater(diff, 0.15)
        self.assertEqual(L.snap_step(56, steps, "title")[0], "title")

    def test_pdftoppm_failure_is_a_warning_not_a_crash_and_pdf_skips_the_probe(self):
        bin_dir = self.tmp / "fakebin"
        bin_dir.mkdir(exist_ok=True)
        (bin_dir / "soffice").write_text('#!/bin/sh\nfor last; do :; done\nout="$5/$(basename "$6" .pptx).pdf"\nprintf "%%PDF-1.4" > "$out"\n')
        (bin_dir / "pdftoppm").write_text("#!/bin/sh\nexit 1\n")
        (bin_dir / "pdftocairo").write_text("#!/bin/sh\nexit 1\n")
        for f in bin_dir.iterdir():
            f.chmod(0o755)
        env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
        out = self.tmp / "x-fake"
        run = subprocess.run([sys.executable, "-I", "-B", str(SCRIPTS / "extract_pptx.py"), str(self.tmp / "template.potx"), "--out", str(out), "--soffice", f"sh {bin_dir / 'soffice'}"], capture_output=True, text=True, env=env, timeout=120)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        warnings = json.loads((out / "extraction.json").read_text())["warnings"]
        self.assertTrue(any("pdftoppm failed" in w for w in warnings), warnings)
        pdf = self.tmp / "x.pdf"
        pdf.write_bytes(b"%PDF-1.4")
        out = self.tmp / "x-pdf"
        run = subprocess.run([sys.executable, "-I", "-B", str(SCRIPTS / "extract_pptx.py"), str(self.tmp / "template.potx"), "--out", str(out), "--pdf", str(pdf)], capture_output=True, text=True, env=env, timeout=120)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        warnings = json.loads((out / "extraction.json").read_text())["warnings"]
        self.assertTrue(any("layout probe was skipped" in w for w in warnings), warnings)
        self.assertFalse(any("leftover default" in w for w in warnings))  # a slideless template is not a leftover default theme

    def test_rerunning_propose_keeps_the_agents_edits(self):
        self.extract("template.potx")
        extraction = self.tmp / "x-template.potx/extraction.json"
        catalog_file = self.tmp / "catalog.json"
        catalog_file.write_text(json.dumps({"layouts": list(catalog().values())}))
        draft_file = self.tmp / "draft.json"
        draft_file.write_text(json.dumps(draft()))
        command = [sys.executable, "-I", "-B", str(SCRIPTS / "brand_tools.py"), "propose-layouts", str(extraction), "--draft", str(draft_file), "--catalog", str(catalog_file)]
        self.assertEqual(subprocess.run(command, capture_output=True, text=True).returncode, 0)
        d = json.loads(draft_file.read_text())
        d["layouts"][0]["name"] = "my-own-name"
        d["layouts"][1]["keep"] = False
        draft_file.write_text(json.dumps(d))
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        again = json.loads(draft_file.read_text())["layouts"]
        self.assertEqual(again[0]["name"], "my-own-name")
        self.assertFalse(again[1]["keep"])
        self.assertEqual(len(again), len(d["layouts"]))
        subprocess.run(command + ["--replace"], capture_output=True, text=True)
        self.assertNotEqual(json.loads(draft_file.read_text())["layouts"][0]["name"], "my-own-name")


@unittest.skipUnless(repo_root() is not None and shutil.which("node"), "needs a framework checkout and node")
class FrameworkAgrees(Fixture):
    """layouts.ts the emitter wrote is read by the framework's static reader and passes checkBrandLayouts."""

    def test_emitted_layouts_load_in_the_framework(self):
        ex = self.extract("template.potx")
        cat = L.load_catalog(None, repo_root()) if False else None  # the real catalog needs a deck: the fake one below is enough for the shape
        dr = draft()
        dr["color"]["surfaces"] = {"default": {"bg": "#F7F4EE", "fg": "#0F1B2D"}}
        dr["layouts"] = [spec for spec in L.propose(ex, catalog(), dr, "zz-test")[0] if spec["fallback"] in ("title", "content", "section", "split")]
        for spec in dr["layouts"]:
            spec.pop("background", None)  # no rendered art in this run
        self.assertTrue(dr["layouts"])
        ws = Workspace()
        try:
            run = ws.emit(dr)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            link = ws.brand_dir() / "node_modules"  # the framework's packages, from a brand folder that already resolves them
            source = repo_root() / "brands/default/node_modules"
            if not source.is_dir():
                self.skipTest("the framework checkout has no installed packages")
            link.symlink_to(source)
            checked = subprocess.run(["node", str(HERE / "fw_layouts_check.mts"), str(repo_root()), str(ws.repo), "zz-test"], capture_output=True, text=True, timeout=180)
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            self.assertIn("catalog ok", checked.stdout)
        finally:
            ws.close()
