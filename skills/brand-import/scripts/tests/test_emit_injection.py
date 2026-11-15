"""Item 1: nothing from a draft can become code in the emitted brand.ts."""
from __future__ import annotations

import json
import unittest

import _helpers as H

import _brand_rules
import _tsdata

HOSTILE = [
    "X */\nconsole.log(1);/*",
    "*/ import('node:child_process').then(m => m.execSync('id')) /*",
    "back`tick ${process.exit(1)} `",
    "quote ' double \" both",
    "'''''\"",
    "back\\slash \\' \\\\",
    "line\nbreak\r\nand\ttab",
    "ls console.log(1) //",
    "</script><script>alert(1)</script>",
    "\x00\x01\x1f\x7f control",
    "lone \ud800 surrogate",
    "emoji \U0001F600 and accents éü",
    "A" * 100000 + " */ evil() /*",
]


class SerialiserTest(unittest.TestCase):
    def test_every_string_round_trips_through_the_reader(self):
        for value in HOSTILE:
            with self.subTest(value=value[:40]):
                text = _tsdata.module_text({"label": value, value[:50] or "k": [value, {"k": value}]})
                self.assertEqual(_tsdata.read_module(text), {"label": value, value[:50] or "k": [value, {"k": value}]})
                literal = text[len(_tsdata.HEADER):]
                for forbidden in (" ", " ", "</", "\r"):
                    self.assertNotIn(forbidden, literal)
                self.assertNotIn("*/", text[: len(_tsdata.HEADER)].split("*/", 1)[1])

    def test_the_reader_refuses_anything_that_is_not_data(self):
        for body in ("{ a: process.env }", "{ a: `x` }", "{ ...x }", "{ a: 1 /* c */ }", "{ a: 1 }); evil(", "{ ['a']: 1 }", "{ a: 1e999 }",
                     "{ a: -Infinity }", "{ a() {} }", "{ a: 'x' + 'y' }", "{ a: 'raw\nbreak' }", "{ __proto__: {} }", "{ a: '\\x41' }", "[1]"):
            with self.subTest(body=body):
                with self.assertRaises(_tsdata.NotData):
                    _tsdata.read_module(_tsdata.HEADER + body + _tsdata.TAIL)
        with self.assertRaises(_tsdata.NotData):
            _tsdata.read_module("import fs from 'node:fs';\n" + _tsdata.module_text({"a": 1}))

    def test_numbers_that_are_not_finite_are_refused(self):
        for value in (float("nan"), float("inf"), -float("inf")):
            with self.assertRaises(ValueError):
                _tsdata.ts({"a": value})


class EmitTest(unittest.TestCase):
    def setUp(self):
        self.ws = H.Workspace()
        self.addCleanup(self.ws.close)

    def hostile_draft(self, value: str) -> dict:
        d = H.draft()
        d["display_name"] = value
        d["source"] = {"kinds": [value, "pdf"], "feel": value}
        d["review"] = [{"severity": "blocker", "topic": value, "question": value}, {"severity": "check", "topic": "fonts", "question": value}]
        for role in ("display", "body", "mono"):
            d["typography"]["families"][role]["family"] = value
            d["typography"]["families"][role]["source"] = {"kind": "unavailable", "reason": value}
            d["typography"]["families"][role]["fallback_family"] = value
        d["chrome"] = {"footer": {"text": value}, "page_number": {"format": "{n} " + value}}
        d["waivers"] = [{"color": "accent-fg", "on": "accent", "reason": value}]
        return d

    def test_hostile_strings_stay_data(self):
        for value in HOSTILE:
            with self.subTest(value=value[:40]):
                run = self.ws.emit(self.hostile_draft(value))
                self.assertEqual(run.returncode, 0, run.stderr[-2000:])
                brand_ts = self.ws.brand_dir() / "brand.ts"
                text = brand_ts.read_text(encoding="utf-8")
                value_read = _tsdata.read_module(text)
                self.assertEqual(value_read["label"], value)
                self.assertEqual(value_read["chrome"]["footer"]["text"], value)
                self.assertEqual(value_read["chrome"]["pageNumber"]["format"], "{n} " + value)
                self.assertEqual(value_read["color"]["waivers"][0]["reason"], value)
                # A family name with nothing usable in it becomes a system font; any other keeps its source.
                expected = {"kind": "unavailable", "reason": value} if _brand_rules.clean_family_name(value) else {"kind": "system"}
                self.assertEqual(value_read["typography"]["families"]["body"]["source"], expected)
                self.assertTrue(_brand_rules.is_family_name(value_read["typography"]["families"]["body"]["family"]))
                # The only comment is the fixed header: no source text in it.
                self.assertEqual(text[: len(_tsdata.HEADER)], _tsdata.HEADER)
                framework = H.framework_read(brand_ts)
                if framework is not None:
                    self.assertTrue(framework["ok"], framework.get("reason"))
                    if "\ud800" not in value:
                        self.assertEqual(framework["value"]["label"], value)
                        self.assertEqual(framework["value"]["color"]["waivers"][0]["reason"], value)
                # Provenance and review text live in a JSON file next to the brand, as data.
                notes = json.loads((self.ws.brand_dir() / "import-notes.json").read_text(encoding="utf-8"))
                self.assertEqual(notes["source"]["feel"], value)
                self.assertEqual(notes["review"][0]["question"], value)

    def test_the_framework_reader_agrees_on_a_plain_draft(self):
        run = self.ws.emit(H.draft())
        self.assertEqual(run.returncode, 0, run.stderr[-2000:])
        framework = H.framework_read(self.ws.brand_dir() / "brand.ts")
        if framework is None:
            self.skipTest("Node or the framework's static reader is not available")
        self.assertTrue(framework["ok"], framework.get("reason"))
        self.assertEqual(framework["value"], _tsdata.read_module((self.ws.brand_dir() / "brand.ts").read_text(encoding="utf-8")))

    def test_hostile_keys_do_not_become_code(self):
        d = H.draft()
        d["color"]["palette"]["x'] }); evil(); ({ ['y"] = {"base": "#112233"}
        d["color"]["palette"]["__proto__"] = {"base": "#112233"}
        d["gradients"] = {"a */ evil() /*": {"type": "linear", "angle": 90, "stops": [{"color": "#112233"}, {"color": "#445566"}]}}
        d["motion"] = {"easing": {"x: evil(), y": [0.2, 0, 0, 1]}}
        run = self.ws.emit(d)
        self.assertEqual(run.returncode, 0, run.stderr[-2000:])
        text = (self.ws.brand_dir() / "brand.ts").read_text(encoding="utf-8")
        _tsdata.read_module(text)
        self.assertNotIn("evil()", text)


if __name__ == "__main__":
    unittest.main()
