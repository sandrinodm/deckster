"""Items 3 and 6: the Keynote renderer never builds AppleScript from a path, OOXML parts with a DTD are refused
whatever their encoding, and archives are read within limits."""
from __future__ import annotations

import gzip
import importlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import _helpers as H

import _filesafe as F

extract_pptx = importlib.import_module("extract_pptx")

FIXTURE = H.SCRIPTS.parent / "evals/files/verdant-partner-meeting.pptx"
BOMB = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><x>&b;</x>'


class KeynoteCommandTest(unittest.TestCase):
    def test_paths_are_arguments_not_script_text(self):
        hostile = Path('/tmp/deck" & (do shell script "id > /tmp/pwned") & "\n end tell\n.pptx')
        target = Path("/tmp/out dir/it's \"source\".pdf")
        command = extract_pptx.keynote_command(hostile, target)
        self.assertEqual(command[:2], ["osascript", "-e"])
        script = command[2]
        self.assertEqual(script, extract_pptx.KEYNOTE_SCRIPT)
        self.assertIn("on run argv", script)
        for piece in ("do shell script", "pwned", "deck", "out dir", str(hostile), str(target)):
            self.assertNotIn(piece, script)
        self.assertEqual(command[3:], [str(hostile.resolve()), str(target.resolve())])
        self.assertEqual(len(command), 5)

    def test_the_renderer_uses_that_command(self):
        source = Path(extract_pptx.__file__).read_text(encoding="utf-8")
        body = source.split("def render(", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("keynote_command(pptx, target)", body)
        self.assertNotIn("tell application", body)


class PackageTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="brand-import-pptx-"))
        self.addCleanup(shutil.rmtree, self.dir, True)

    def package(self, parts: dict) -> Path:
        path = self.dir / "deck.pptx"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            for name, data in parts.items():
                z.writestr(name, data)
        return path

    def test_a_dtd_is_refused_in_every_encoding(self):
        for label, raw in {
            "utf-8": BOMB.encode("utf-8"),
            "utf-16 with BOM": BOMB.encode("utf-16"),
            "utf-16-le": BOMB.replace('"1.0"', '"1.0" encoding="UTF-16LE"').encode("utf-16-le"),
            "utf-16-be": BOMB.replace('"1.0"', '"1.0" encoding="UTF-16BE"').encode("utf-16-be"),
            "utf-32": BOMB.encode("utf-32"),
            "utf-8 declared as latin-1": BOMB.replace('"1.0"', '"1.0" encoding="ISO-8859-1"').encode("utf-8"),
            "utf-7 declared": b'<?xml version="1.0" encoding="UTF-7"?>+ADwAIQ-DOCTYPE x+AFsAPAAh-ENTITY a "b"+AD4AXQA+ADw-x+AD4AJg-a;+ADw-/x+AD4-',
        }.items():
            with self.subTest(encoding=label):
                pkg = extract_pptx.Pkg(self.package({"ppt/presentation.xml": raw}))
                with self.assertRaises(ValueError):
                    pkg.xml("ppt/presentation.xml")

    def test_plain_utf8_parts_still_parse(self):
        for raw in (b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><x a="1"/>', b'\xef\xbb\xbf<x a="1"/>', "<x a='é'/>".encode("utf-8")):
            pkg = extract_pptx.Pkg(self.package({"ppt/presentation.xml": raw}))
            self.assertEqual(pkg.xml("ppt/presentation.xml").tag, "x")

    def test_archives_outside_the_limits_are_refused(self):
        many = self.dir / "many.pptx"
        with zipfile.ZipFile(many, "w") as z:
            for i in range(5001):
                z.writestr(f"ppt/media/i{i}.png", b"")
        bomb = self.dir / "bomb.pptx"
        with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("ppt/media/image1.png", b"\x00" * (40 * 1024 * 1024))
        for path, word in ((many, "entries"), (bomb, "expands")):
            with self.subTest(archive=path.name):
                with self.assertRaises(ValueError) as caught:
                    extract_pptx.Pkg(path)
                self.assertIn(word, str(caught.exception))
        with self.assertRaises(F.Refused):
            F.BoundedZip(bomb, max_ratio=10**9, max_entry_bytes=1024 * 1024)
        with self.assertRaises(F.Refused):
            F.BoundedZip(bomb, max_ratio=10**9, max_total_bytes=1024)
        small = F.BoundedZip(self.package({"a.xml": b"<x/>" * 1000}))
        with self.assertRaises(F.Refused):
            small.read("a.xml", 100)

    @unittest.skipUnless(FIXTURE.is_file(), "the eval PPTX is not here")
    def test_theme_system_colors_use_the_saved_rgb_fallback(self):
        source = self.dir / "system-colors.pptx"
        with zipfile.ZipFile(FIXTURE) as src, zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as dst:
            for info in src.infolist():
                raw = src.read(info.filename)
                if info.filename.startswith("ppt/theme/") and info.filename.endswith(".xml"):
                    root = F.parse_xml(raw)
                    for slot in root.findall(".//a:clrScheme/*", extract_pptx.NS):
                        name = slot.tag.replace(extract_pptx.A, "")
                        if name in ("dk1", "lt1"):
                            slot.clear()
                            extract_pptx.ET.SubElement(slot, extract_pptx.A + "sysClr", {
                                "val": "windowText" if name == "dk1" else "window",
                                "lastClr": "123456" if name == "dk1" else "fefefe",
                            })
                    raw = extract_pptx.ET.tostring(root)
                dst.writestr(info, raw)
        out = self.dir / "out"
        run = subprocess.run([sys.executable, "-I", str(H.UNDER_TEST / "extract_pptx.py"), str(source), "--out", str(out), "--no-render"], capture_output=True, text=True, timeout=120)
        self.assertEqual(run.returncode, 0, run.stderr[-1500:])
        data = json.loads((out / "extraction.json").read_text(encoding="utf-8"))
        colors = {color["name"]: color["hex"] for color in data["declared"]["colors"]}
        self.assertEqual(colors["dk1"], "#123456")
        self.assertEqual(colors["lt1"], "#FEFEFE")

    @unittest.skipUnless(FIXTURE.is_file(), "the eval PPTX is not here")
    def test_media_is_written_under_plain_names_only(self):
        hostile = self.dir / "hostile.pptx"
        with zipfile.ZipFile(FIXTURE) as src, zipfile.ZipFile(hostile, "w", zipfile.ZIP_DEFLATED) as dst:
            for info in src.infolist():
                dst.writestr(info, src.read(info.filename))
            for name in ("ppt/media/../../../../escape.png", "ppt/media/.hidden.png", "ppt/media/run.sh", "ppt/media/a b;c.png", "ppt/media/sub/", "ppt/media/..",
                         "ppt/media/ok-extra.png"):
                dst.writestr(name, H.PNG)
        out = self.dir / "out"
        run = subprocess.run([sys.executable, "-I", str(H.UNDER_TEST / "extract_pptx.py"), str(hostile), "--out", str(out), "--no-render"], capture_output=True, text=True, timeout=120)
        self.assertEqual(run.returncode, 0, run.stderr[-1500:])
        self.assertEqual(sorted(p.name for p in (out / "assets/media").iterdir()), ["image1.png", "ok-extra.png"])
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), ["hostile.pptx", "out"])


class OfflineRenderCopyTest(unittest.TestCase):
    REL = "http://schemas.openxmlformats.org/package/2006/relationships"
    IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir, ignore_errors=True)

    def fixture_count(self) -> int:
        """What the fixture deck alone neutralises: its two embedded chart workbooks and its printer
        settings blob, none of which the renderer needs to draw the slides."""
        count = extract_pptx.offline_copy(FIXTURE, self.dir / "fixture-copy.pptx")
        self.assertEqual(count, 3)
        return count

    def rels(self, *targets: tuple[str, str]) -> str:
        items = "".join(
            f'<Relationship Id="rId{i}" Type="{self.IMAGE}" Target="{target}"{mode}/>'
            for i, (target, mode) in enumerate(targets, start=1)
        )
        return f'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="{self.REL}">{items}</Relationships>'

    def package(self, path: Path, extra: dict[str, bytes | str], base: Path | None = FIXTURE) -> Path:
        with zipfile.ZipFile(path, "w") as dst:
            if base is not None:
                with zipfile.ZipFile(base) as src:
                    for info in src.infolist():
                        dst.writestr(info, src.read(info.filename))
            for name, data in extra.items():
                dst.writestr(name, data)
        return path

    def test_every_reference_that_leaves_the_package_points_nowhere(self):
        rels = self.rels(
            ("https://attacker.example/external.png", ' TargetMode="External"'),
            ("https://attacker.example/odd-mode.png", ' TargetMode=" external "'),
            ("https://attacker.example/internal-mode.png", ""),
            ("\\\\attacker.example\\share\\unc.png", ""),
            ("../media/image1.png", ""),
        )
        linked = self.package(self.dir / "linked.pptx", {"ppt/slides/_rels/linked.xml.RELS": rels})
        copy = self.dir / "copy.pptx"
        self.assertEqual(extract_pptx.offline_copy(linked, copy), self.fixture_count() + 4)
        with zipfile.ZipFile(copy) as out:
            written = out.read("ppt/slides/_rels/linked.xml.RELS").decode("utf-8")
            self.assertEqual(len(out.namelist()), len(zipfile.ZipFile(linked).namelist()))
        self.assertNotIn("attacker.example", written)
        self.assertEqual(written.count(f'Target="{extract_pptx.OFFLINE_TARGET}"'), 4)
        self.assertIn('Target="../media/image1.png"', written)

    def test_embedded_objects_are_emptied_and_svg_is_cleaned_whatever_its_name(self):
        inner = self.package(
            self.dir / "inner.xlsx",
            {"xl/_rels/workbook.xml.rels": self.rels(("https://attacker.example/inner.png", ' TargetMode="External"'))},
            base=None,
        )
        svg = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.example/svg.png"/><rect width="1" height="1"/></svg>'
        ole_rels = (
            f'<Relationships xmlns="{self.REL}"><Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" '
            'Target="../media/payload%20one.png"/></Relationships>'
        )
        deck = self.package(
            self.dir / "embedded.pptx",
            {
                "ppt/embeddings/Workbook1.xlsx": inner.read_bytes(),
                "ppt/media/hidden-zip.png": inner.read_bytes(),
                "ppt/media/legacy.bin": extract_pptx.CFB_MAGIC + b"\x00" * 504,
                "ppt/media/logo.svgz": gzip.compress(svg.encode("utf-8")),
                "ppt/media/payload one.png": H.PNG,
                "ppt/slides/_rels/ole.xml.rels": ole_rels,
                "ppt/media/logo.svg": svg,
                "ppt/media/logo-in-disguise.png": svg,
                "ppt/media/late-root.xml": '<?xml version="1.0"?><!-- padding --><x:svg xmlns:x="http://www.w3.org/2000/svg"><x:image href="https://attacker.example/late.png"/></x:svg>',
                "ppt/media/keep.png": H.PNG,
            },
        )
        copy = self.dir / "copy.pptx"
        self.assertEqual(extract_pptx.offline_copy(deck, copy), self.fixture_count() + 8)
        with zipfile.ZipFile(copy) as out:
            for name in ("ppt/embeddings/Workbook1.xlsx", "ppt/media/hidden-zip.png", "ppt/media/legacy.bin",
                         "ppt/media/logo.svgz", "ppt/media/payload one.png"):
                self.assertEqual(out.read(name), b"", name)
            for name in ("ppt/media/logo.svg", "ppt/media/logo-in-disguise.png", "ppt/media/late-root.xml"):
                self.assertNotIn(b"attacker.example", out.read(name), name)
            self.assertIn(b"<rect", out.read("ppt/media/logo.svg"))
            self.assertEqual(out.read("ppt/media/keep.png"), H.PNG)

    def test_relationship_parts_must_be_plain_opc_lists(self):
        foreign_root = '<Relationships xmlns="urn:other"><Relationship Id="rId1" Target="https://attacker.example/x" TargetMode="External"/></Relationships>'
        foreign_child = (
            f'<Relationships xmlns="{self.REL}"><x:Relationship xmlns:x="urn:other" Id="rId1" '
            'Target="https://attacker.example/x" TargetMode="External"/></Relationships>'
        )
        for index, rels in enumerate((foreign_root, foreign_child)):
            deck = self.package(self.dir / f"foreign-{index}.pptx", {"ppt/slides/_rels/odd.xml.rels": rels})
            with self.assertRaises(F.Refused):
                extract_pptx.offline_copy(deck, self.dir / f"copy-{index}.pptx")

    def test_part_names_that_differ_only_in_case_are_refused(self):
        rels = self.rels(("https://attacker.example/x.png", ' TargetMode="External"'))
        deck = self.package(self.dir / "twins.pptx", {"ppt/slides/_rels/a.xml.rels": rels, "ppt/slides/_rels/A.xml.rels": rels})
        with self.assertRaises(F.Refused):
            extract_pptx.offline_copy(deck, self.dir / "copy.pptx")


class RenderCapTest(unittest.TestCase):
    def test_a_page_of_extreme_shape_is_rendered_within_the_pixel_limit(self):
        zoom, lowered = F.capped_zoom(960, 540, 1920)
        self.assertEqual((zoom, lowered), (2.0, False))
        zoom, lowered = F.capped_zoom(1, 14400, 1920)
        self.assertTrue(lowered)
        self.assertLessEqual((1 * zoom) * (14400 * zoom), F.MAX_PIXELS + 1)
        with self.assertRaises(F.Refused):
            F.capped_zoom(0, 100, 1920)


if __name__ == "__main__":
    unittest.main()
