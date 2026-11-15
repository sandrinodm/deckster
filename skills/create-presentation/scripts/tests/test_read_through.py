"""read_through.py takes the slide list from the deck config's code, never from a comment or a string, and
fails when there is none.

  python3 -I -m unittest discover -s skills/create-presentation/scripts/tests
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(os.environ.get("CREATE_PRESENTATION_SCRIPTS", Path(__file__).resolve().parent.parent)) / "read_through.py"

SLIDE = """---
layout: content
title: Churn fell by a third after the onboarding rewrite
budget: 1m
---

Body.

<Notes>
We rewrote onboarding in March and churn fell from nine to six percent within one quarter, which is why the next two quarters go into the same playbook.
</Notes>
"""


def config(body: str) -> str:
    return "import { defineDeck } from '@deckster/engine/config';\n\n" + body


class ReadThroughTest(unittest.TestCase):
    def setUp(self):
        self.deck = Path(tempfile.mkdtemp(prefix="read-through-")) / "deck"
        (self.deck / "slides").mkdir(parents=True)
        self.addCleanup(shutil.rmtree, self.deck.parent, True)
        for name in ("real-one", "real-two", "decoy"):
            (self.deck / "slides" / f"{name}.mdx").write_text(SLIDE, encoding="utf-8")

    def run_script(self, text: str):
        (self.deck / "deck.config.ts").write_text(text, encoding="utf-8")
        run = subprocess.run([sys.executable, "-I", str(SCRIPT), str(self.deck), "--json"], capture_output=True, text=True, timeout=60)
        return run, (json.loads(run.stdout) if run.stdout.strip().startswith("{") else None)

    def test_a_slides_list_in_a_comment_or_string_is_not_the_slide_list(self):
        text = config("""/**
 * Old order, kept for reference: slides: ['decoy'], duration: '99m'
 */
// slides: ["decoy"],
export default defineDeck({
  title: "A deck about slides: ['decoy'] and such",
  brand: 'default', /* slides: ['decoy'] */
  theme: { slides: ['decoy'] },
  duration: '10m',
  slides: [
    'real-one', // 'decoy'
    "real-two",
  ],
});
""")
        run, data = self.run_script(text)
        self.assertEqual(run.returncode, 0, run.stderr + run.stdout)
        self.assertEqual([s["id"] for s in data["slides"]], ["real-one", "real-two"])
        self.assertEqual(data["duration"], 600)

    def test_no_slides_is_a_failure_not_a_pass(self):
        for label, body in {
            "empty list": "export default defineDeck({ title: 'x', slides: [] });\n",
            "no slides key": "export default defineDeck({ title: 'x' });\n",
            "only in a comment": "// slides: ['decoy']\nexport default defineDeck({ title: 'x' });\n",
            "only in a string": "export default defineDeck({ title: \"slides: ['decoy']\" });\n",
            "only nested": "export default defineDeck({ title: 'x', extra: { slides: ['decoy'] } });\n",
            "not a literal": "const s = ['decoy'];\nexport default defineDeck({ title: 'x', slides: s });\n",
            "no defineDeck": "export const slides = ['decoy'];\n",
            "path as id": "export default defineDeck({ slides: ['../../../../etc/passwd'] });\n",
            "spread": "export default defineDeck({ slides: [...other, 'decoy'] });\n",
        }.items():
            with self.subTest(case=label):
                run, data = self.run_script(config(body))
                self.assertEqual(run.returncode, 2, run.stdout[:300])
                self.assertIsNone(data)
                self.assertTrue(run.stderr.strip())

    def test_duration_after_slides_is_read_at_the_top_level(self):
        for body in (
            "slides: ['real-one'], duration: '20m'",
            "slides: ['real-one'], extra: { duration: '99m' }, duration: '20m'",
            "slides: ['real-one'], extra: ['99m'], duration: '20m'",
        ):
            with self.subTest(body=body):
                run, data = self.run_script(config(f"export default defineDeck({{{body}}});"))
                self.assertEqual(run.returncode, 0, run.stderr + run.stdout)
                self.assertEqual(data["duration"], 1200)

    def test_tsx_literal_frontmatter_with_typescript_suffixes_is_read(self):
        for annotation, suffix in (
            ("", ";"),
            ("", " satisfies SlideFrontmatterInput;"),
            ("", " as const;"),
            (": SlideFrontmatterInput", ";"),
            ("", "\n\nexport default function Slide() {}"),
        ):
            with self.subTest(annotation=annotation, suffix=suffix):
                slide = """// export const frontmatter = { title: 'Decoy' };
/*
export const frontmatter = { title: 'Another decoy' };
*/
export default function Slide() { return <p>It's ready for the presenter.</p>; }
export const frontmatter%s = {
  title: 'Churn fell despite the } in this title',
  surface: "accent",
  budget: `45s`,
  layout: 'statement',
  nested: { title: 'Decoy', budget: '99m' },
}%s
<Notes>We rewrote onboarding and churn fell.</Notes>
""" % (annotation, suffix)
                (self.deck / "slides/typed.tsx").write_text(slide, encoding="utf-8")
                run, data = self.run_script(config("export default defineDeck({ duration: '10m', slides: ['typed'] });"))
                self.assertEqual(run.returncode, 0, run.stderr + run.stdout)
                self.assertEqual(data["slides"][0]["title"], "Churn fell despite the } in this title")
                self.assertEqual(data["slides"][0]["surface"], "accent")
                self.assertEqual(data["slides"][0]["layout"], "statement")
                self.assertEqual(data["slides"][0]["budget"], 45)

    def test_the_repo_sample_deck_still_reads(self):
        root = next((p for p in Path(__file__).resolve().parents if (p / "decks/hello/deck.config.ts").is_file()), None)
        if root is None:
            self.skipTest("not inside the deck repo")
        run = subprocess.run([sys.executable, "-I", str(SCRIPT), str(root / "decks/hello"), "--json"], capture_output=True, text=True, timeout=60)
        slides = json.loads(run.stdout)["slides"]
        self.assertEqual([s["id"] for s in slides], ["title", "steps", "live-counter", "closing"])
        self.assertEqual(slides[2]["title"], "A TSX slide")
        self.assertEqual(slides[2]["surface"], "accent")
        self.assertEqual(slides[2]["budget"], 45)


if __name__ == "__main__":
    unittest.main()
