"""Item 9: the emitter never writes a brand outside the framework's rules: numbers finite and in range,
family names, OpenType tags, font paths, unicode-range, oklch() limits, data palette counts."""
from __future__ import annotations

import json
import unittest

import _helpers as H

import _brand_rules as R
import _tsdata


class RuleHelpersTest(unittest.TestCase):
    def test_colours(self):
        for good in ("#fff", "#1F2937", "#1f293780", "oklch(0.62 0.19 259)", "oklch(62% 0.19 259deg / 50%)", "oklch(1 1 360)", "ink.900", "ink.900/12"):
            self.assertTrue(R.is_color_ref(good), good)
        for bad in ("red", "#12", "#zzzzzz", "oklch(0.6 1.01 20)", "oklch(0.6 0.2 361)", "oklch(1.2 0.2 20)", "oklch(0.5 0.1 20 / 2)", "rgb(0 0 0)",
                    "#fff; } body { x: url(http://a)", "oklch(0.5 0.1 20) ", 5, None, "ink.900/1234", "var(--x)"):
            self.assertFalse(R.is_color_ref(bad) and bad == str(bad).strip(), bad)

    def test_names_tags_and_ranges(self):
        for good in ("IBM Plex Sans", "Söhne", "-apple-system", "Franklin Gothic & Co.", "Noto Sans JP", "PP Neue Montreal+", "O'Reilly_Sans"):
            self.assertTrue(R.is_family_name(good), good)
        for bad in ("", " Inter", "Inter\"; } body {", "a/b", "a\\b", "x" * 101, "Inter\n", "url(x)", "@import", "a,b", "a;b", "{}"):
            self.assertFalse(R.is_family_name(bad), bad)
        self.assertEqual(R.clean_family_name('Evil"; } body { x: y'), "Evil body x y")
        self.assertIsNone(R.clean_family_name('";{}'))
        for good in ("tnum", "ss01", "wght", "opsz", "a   "):
            self.assertTrue(R.is_opentype_tag(good), good)
        for bad in ("", "tn", "tnums", "'ss01' 1", "ss-1", "wgh\n", " abc", 4):
            self.assertFalse(R.is_opentype_tag(bad), bad)
        self.assertTrue(R.is_unicode_range("U+0000-00FF, U+0131, U+4??"))
        for bad in ("", "U+110000", "U+00FF-0000", "0000-00FF", "U+0; } x {", "U+1234567", ",".join(["U+1"] * 513)):
            self.assertFalse(R.is_unicode_range(bad), bad)
        for good in ("@fontsource/inter", "@fontsource-variable/ibm-plex-sans"):
            self.assertTrue(R.is_fontsource_package(good))
        for bad in ("fontsource/inter", "@fontsource/Inter", "@fontsource/a/b", "@fontsource/", "@fontsource/x@1", "@fontsource-variable/x\n"):
            self.assertFalse(R.is_fontsource_package(bad), bad)


class EmitRulesTest(unittest.TestCase):
    def setUp(self):
        self.ws = H.Workspace()
        self.addCleanup(self.ws.close)

    def emit(self, d: dict):
        run = self.ws.emit(d)
        self.assertEqual(run.returncode, 0, run.stderr[-2000:])
        return run, H.read_brand(self.ws.brand_dir() / "brand.ts")

    def test_out_of_range_and_malformed_values_are_clamped_or_left_out(self):
        d = H.draft()
        d["color"]["roles"]["heading"] = "oklch(0.5 3 720)"
        d["color"]["surfaces"] = {"inverse": {"bg": "#0F1B2D", "fg": "#F7F4EE", "muted": "#fff; } body { color: red", "accent": "#FF5A36",
                                             "data": {"categorical": ["#FF5A36", "#7A2CF5"], "diverging": ["#111111", "#222222", "#333333", "#444444"], "context": "#555555"},
                                             "shadow": {"md": [{"x": 5000, "y": -99999, "blur": 1e9, "spread": 1e9, "color": "#000000"}]}}}
        d["gradients"] = {"dusk": {"type": "linear", "angle": 725, "stops": [{"pos": 0, "color": "#FF5A36"}, {"pos": 7, "color": "#7A2CF5"}], "grain": 9},
                          "mesh": {"type": "mesh", "base": "#111111", "points": [{"color": "#222222", "at": "500% 20%", "size": 900}]}}
        fam = d["typography"]["families"]["body"]
        fam.update({"family": 'Evil"; } body { x: y', "fallback": "Helvetica Neue, b{}c, url(x), sans-serif", "substitute": {"family": "Arial", "panose": "zz", "pitchFamily": 999}})
        d["typography"]["scale"]["display"].update({"size": 5000, "line_height": 40, "tracking": 9, "weight": 99999,
                                                    "axes": {"wght": 1e6, "toolong": 3, "opsz": 14, "ab": 1}, "features": ["tnum", "'ss01' 1; }", "x", 7]})
        d["shape"] = {"radius": {"sm": 1e9, "lg": -4}, "stroke": {"width": 99999}, "shadow": {"card": "0 99999px 5px -3000px rgb(0 0 0 / 0.5)"},
                      "margin": {"x": 1e12, "y": -1}, "grid": {"columns": 400, "gutter": 5000}, "spacing": {"md": 1e30}}
        d["logo"] = {"height": 1e6, "clear_space": 500}
        d["icons"] = {"set": "Lucide Icons!", "stroke_width": 90}
        d["chrome"] = {"progress": {"edge": "left", "thickness": 1e5}}
        d["motion"] = {"easing": {"standard": [7, 99, -3, -99], "bad": "cubic-bezier(1, 2)"}, "duration": {"fast": 1e9, "base": -5, "slow": 500}}
        run, brand = self.emit(d)
        notes: list[str] = []
        self.assertEqual(R.conform(brand, notes), brand)
        self.assertEqual(notes, [], "the emitted brand already satisfies every rule")
        self.assertNotIn("heading", brand["color"]["roles"])
        inverse = brand["color"]["surfaces"]["inverse"]
        self.assertEqual(inverse["data"], {"context": "#555555"})
        self.assertEqual(inverse["shadow"]["md"], [{"x": 1920, "y": -1920, "blur": 1920, "spread": 1920, "color": "#000000"}])
        self.assertEqual(brand["gradients"]["dusk"]["angle"], 5)
        self.assertEqual(brand["gradients"]["dusk"]["stops"][1], {"color": "#7a2cf5", "at": 100})
        self.assertEqual(brand["gradients"]["dusk"]["grain"], 0.4)
        self.assertEqual(brand["gradients"]["mesh"]["points"], [{"color": "#222222", "x": 100, "y": 20, "size": 100}])
        body = brand["typography"]["families"]["body"]
        self.assertEqual(body["family"], "Evil body x y")
        self.assertEqual(body["fallback"], ["Helvetica Neue", "bc", "urlx", "sans-serif"])
        self.assertEqual(body["substitute"], {"family": "Arial", "pitchFamily": 255})
        display = brand["typography"]["scale"]["display"]
        self.assertEqual((display["size"], display["lineHeight"], display["tracking"], display["weight"]), (1920, 2.5, 0.5, 1000))
        self.assertEqual(display["axes"], {"wght": 1000, "opsz": 14})
        self.assertEqual(display["features"], ["tnum"])
        self.assertEqual(brand["shape"]["radius"]["sm"], 1920)
        self.assertEqual(brand["shape"]["radius"]["lg"], 0)
        self.assertEqual(brand["shape"]["shadow"]["md"][0]["y"], 1920)
        self.assertEqual(brand["shape"]["shadow"]["md"][0]["spread"], -1920)
        self.assertEqual(brand["spacing"]["margin"], {"x": 1920, "y": 0})
        self.assertEqual(brand["spacing"]["grid"], {"columns": 24, "gutter": 1920})
        self.assertEqual(brand["spacing"]["scale"]["md"], 1920)
        self.assertEqual(brand["logo"]["placement"]["height"], 1920)
        self.assertEqual(brand["logo"]["clearSpace"], 10)
        self.assertEqual(brand["icons"], {"set": "lucide-icons", "strokeWidth": 4})
        self.assertEqual(brand["motion"]["easings"]["standard"], [1, 5, 0, -5])
        self.assertEqual(brand["motion"]["durations"], {"fast": 3000, "base": 0, "slow": 500})
        self.assertGreater(run.stdout.count("note:"), 15)
        saved = json.loads((self.ws.brand_dir() / "import-notes.json").read_text(encoding="utf-8"))
        self.assertTrue(any("typography.scale.display.axes" in n for n in saved["notes"]))

    def test_hex_shadow_alpha_survives_emission_and_framework_reading(self):
        colors = ("#0F1B2D14", "#1234", "#0000", "#12345600", "#0F1B2D", "#ABC")
        expected = ("#0f1b2d14", "#1234", "#0000", "#12345600", "ink.base", "#aabbcc")
        for css in (False, True):
            with self.subTest(css=css):
                d = H.draft()
                layers = [{"y": 8, "blur": 24, "color": color} for color in colors]
                d["shape"] = {"shadow": {"card": ", ".join("0 8px 24px " + color for color in colors) if css else layers}}
                _, brand = self.emit(d)
                self.assertEqual(tuple(layer["color"] for layer in brand["shape"]["shadow"]["md"]), expected)
                self.assertEqual(brand["shape"]["shadow"]["md"], brand["shape"]["shadow"]["lg"])
                framework = H.framework_read(self.ws.brand_dir() / "brand.ts")
                if framework is not None:
                    self.assertTrue(framework["ok"], framework)
                    self.assertEqual(framework["value"]["shape"]["shadow"], brand["shape"]["shadow"])

    def test_motion_names_every_easing_and_duration_the_kit_animates_with(self):
        # The kit's entrance, step reveals and chart builds read emphasized; a brand without it once
        # left them still. A draft with one easing, or none, still gets all three.
        for motion in ({"easing": {"standard": "cubic-bezier(0.22, 1, 0.36, 1)"}}, {}):
            with self.subTest(motion=motion):
                d = H.draft()
                d["motion"] = motion
                run, brand = self.emit(d)
                easings = brand["motion"]["easings"]
                self.assertEqual(sorted(easings), ["emphasized", "exit", "standard"])
                self.assertEqual(easings["emphasized"], easings["standard"])
                self.assertEqual(easings["exit"], [0.4, 0, 1, 1])
                self.assertEqual(sorted(brand["motion"]["durations"]), ["base", "fast", "slow"])
                if motion:
                    self.assertIn("motion.easings.emphasized", run.stdout)

    def test_malformed_shadow_hex_is_not_truncated_to_a_valid_color(self):
        for color in ("#12345", "#112233445", "#11223344zz"):
            for css in (False, True):
                with self.subTest(color=color, css=css):
                    d = H.draft()
                    d["shape"] = {"shadow": {"card": "0 8px 24px " + color if css else [{"y": 8, "blur": 24, "color": color}]}}
                    run = self.ws.emit(d)
                    if run.returncode == 0:
                        brand = H.read_brand(self.ws.brand_dir() / "brand.ts")
                        self.assertNotIn("md", brand["shape"]["shadow"])
                        self.assertIn("note:", run.stdout)
                    else:
                        self.assertIn("Nothing was written", run.stderr)

    def test_a_required_value_that_cannot_be_fixed_stops_the_emitter(self):
        cases = {
            "NaN margin": lambda d: d.update(shape={"margin": {"x": float("nan"), "y": 96}}),
            "infinite type size": lambda d: d["typography"]["scale"]["body"].update(size=float("inf")),
            "accent is not a colour": lambda d: d["color"]["roles"].update(accent="oklch(0.6 2 40)"),
            "two categorical colours": lambda d: d["color"]["data"].update(categorical=["#D63913", "#7A2CF5"]),
            "even diverging": lambda d: d["color"]["data"].update(diverging=["#111111", "#222222", "#333333", "#444444"]),
            "string for a number": lambda d: d.update(shape={"radius": {"sm": "4px; } *{", "lg": 12}}),
            "draft is a list": None,
        }
        for label, change in cases.items():
            with self.subTest(case=label):
                d = H.draft()
                if change is None:
                    d = [d]
                else:
                    change(d)
                run = self.ws.emit(d)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn("Nothing was written", run.stderr)
                self.assertFalse(self.ws.brand_dir().exists())


if __name__ == "__main__":
    unittest.main()
