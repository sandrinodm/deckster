"""Shared pieces of the brand-import script tests.

Run all of them, from anywhere, with:

  python3 -I -m unittest discover -s skills/brand-import/scripts/tests

`-I` keeps the interpreter from importing anything out of the current directory or the user's
site-packages: these tests read hostile fixtures. No third-party package is needed. The browser
test in test_web_extract.py runs only when Playwright is importable, for example:

  uv run --no-project --with playwright --with pillow --with numpy python -I -m unittest discover -s skills/brand-import/scripts/tests

Local servers listen on 127.0.0.1, ports 5960 to 5969. BRAND_IMPORT_SCRIPTS points the tests at
another copy of the scripts (an older version, to see a test fail on it).
"""
from __future__ import annotations

import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent
UNDER_TEST = Path(os.environ.get("BRAND_IMPORT_SCRIPTS", SCRIPTS)).resolve()
for entry in (str(SCRIPTS), str(UNDER_TEST)):
    if entry in sys.path:
        sys.path.remove(entry)
    sys.path.insert(0, entry)

PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000080000000208060000007f39e2a10000000d49444154789c6360a03830000000820001a5d6a6f80000000049454e44ae426082")
WOFF2 = b"wOF2" + b"\x00\x01\x00\x00" + b"\x00" * 40
SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><path d="M0 0h40v10H0z" fill="#111111"/></svg>'

_DRAFT = {
    "draft": "brand-draft/1",
    "name": "zz-test",
    "display_name": "ZZ Test",
    "source": {"kinds": ["pdf"], "feel": "calm"},
    "color": {
        "palette": {"ink": {"base": "#0F1B2D"}, "paper": {"base": "#F7F4EE"}, "coral": {"base": "#D63913"}},
        "roles": {"bg": "#F7F4EE", "surface": "#FFFFFF", "fg": "#0F1B2D", "muted": "#5B6472", "accent": "#D63913", "accent_fg": "#FFFFFF", "border": "#D9D4C7"},
        "surfaces": {},
        "data": {"categorical": ["#D63913", "#7A2CF5", "#00635F"], "sequential": ["#FFE9E4", "#F36C4F", "#6C1E0D"],
                 "diverging": ["#7118E9", "#EDEBE7", "#B32600"], "context": "#C9C3B6"},
    },
    "gradients": {},
    "typography": {
        "families": {
            "display": {"family": "Inter", "source": {"kind": "system"}, "fallback": "sans-serif", "category": "sans"},
            "body": {"family": "Inter", "source": {"kind": "system"}, "fallback": "sans-serif", "category": "sans"},
            "mono": {"family": "Menlo", "source": {"kind": "system"}, "fallback": "monospace", "category": "mono"},
        },
        "scale": {"display": {"family": "display", "size": 96, "line_height": 1.05, "weight": 700},
                  "body": {"family": "body", "size": 32, "line_height": 1.4, "weight": 400}},
    },
    "review": [],
}


def draft() -> dict:
    """A small draft the emitter accepts, to change one field of."""
    return copy.deepcopy(_DRAFT)


class Workspace:
    """A scratch workspace folder and import work folder, removed on close."""

    def __init__(self):
        self.root = Path(tempfile.mkdtemp(prefix="brand-import-test-"))
        self.repo = self.root / "repo"
        self.work = self.root / "repo" / ".brand-import" / "zz-test"
        self.work.mkdir(parents=True)
        (self.repo / "brands").mkdir()

    def close(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    def emit(self, data: dict, *flags: str) -> subprocess.CompletedProcess:
        path = self.work / "brand-draft.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return subprocess.run([sys.executable, "-I", str(UNDER_TEST / "emit_brand.py"), str(path), "--workspace", str(self.repo), "--offline", "--force", *flags],
                              capture_output=True, text=True, timeout=120)

    def brand_dir(self, name: str = "zz-test") -> Path:
        return self.repo / "brands" / name


def repo_root() -> Path | None:
    """The deckster repository checkout this skill sits in, when the framework's static reader is there (only when developing the skill inside it; installed users never have it)."""
    for parent in HERE.parents:
        if (parent / "packages/brand/src/node/static-module.ts").is_file():
            return parent
    return None


_READER = """
import fs from 'node:fs';
const { readStaticModule, BRAND_CALLEE } = await import(process.argv[2]);
process.stdout.write(JSON.stringify(readStaticModule(fs.readFileSync(process.argv[3], 'utf8'), BRAND_CALLEE)));
"""


def framework_read(brand_ts: Path) -> dict | None:
    """What the framework's own static reader (it parses, never runs) says about a brand file: {ok, value} or
    {ok: false, reason}. None when Node or the repo is not available."""
    root, node = repo_root(), shutil.which("node")
    if root is None or node is None:
        return None
    script = Path(tempfile.mkdtemp(prefix="brand-import-reader-")) / "read.mjs"
    script.write_text(_READER)
    try:
        run = subprocess.run([node, str(script), str(root / "packages/brand/src/node/static-module.ts"), str(brand_ts)], capture_output=True, text=True, timeout=60)
    finally:
        shutil.rmtree(script.parent, ignore_errors=True)
    if run.returncode != 0:
        return None
    return json.loads(run.stdout)


def read_brand(brand_ts: Path) -> dict:
    """The value of an emitted brand.ts, read without running it: with the skill's strict reader, or, for a
    file in another shape (an older emitter's), with the framework's static reader."""
    import _tsdata

    text = brand_ts.read_text(encoding="utf-8")
    try:
        return _tsdata.read_module(text)
    except _tsdata.NotData:
        framework = framework_read(brand_ts)
        if framework is None or not framework.get("ok"):
            raise
        return framework["value"]
