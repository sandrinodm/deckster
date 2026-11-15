# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Grade one synthesis run against the expectations in evals.json.

Usage:
  uv run grade.py --eval <id> --run <.../with_skill | .../without_skill>

Reads every text file under <run>/outputs, applies a programmatic check per expectation
where one is possible, and takes the rest from <run>/manual_grades.json
({"<expectation index>": {"passed": bool, "evidence": "..."}}), which a reviewer writes
after looking at the handover and the rendered images. Writes <run>/grading.json in the
shape the skill-creator viewer expects (expectations[].text / passed / evidence).

The checks accept any output format (brand-draft.json, brand.ts, YAML, Markdown): they
look for exact values and for values sitting near the words that give them a role.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
TEXT_EXT = {".json", ".ts", ".tsx", ".js", ".mjs", ".md", ".txt", ".yaml", ".yml", ".css", ".html", ".toml"}


def load(run: Path) -> tuple[str, str, list[Path]]:
    out = run / "outputs"
    corpus, handover = [], ""
    files = [p for p in out.rglob("*") if p.is_file()]
    for p in files:
        if p.suffix.lower() in TEXT_EXT and p.stat().st_size < 3_000_000:
            text = p.read_text(errors="replace")
            # Raw extraction dumps prove nothing about synthesis: a value has to appear in the brand or the handover.
            if p.name in ("extraction.json", "analysis.json"):
                continue
            if p.name.upper().startswith("HANDOVER"):
                handover = text
            corpus.append(f"\n<<<{p.relative_to(out)}>>>\n{text}")
    return "".join(corpus), handover, files


def has(c: str, *vals: str) -> tuple[bool, str]:
    missing = [v for v in vals if v.lower() not in c.lower()]
    return not missing, "all present" if not missing else f"missing {missing}"


def near(c: str, word_re: str, val: str, window: int = 90) -> tuple[bool, str]:
    for m in re.finditer(re.escape(val), c, re.I):
        ctx = c[max(0, m.start() - window): m.end() + window]
        if re.search(word_re, ctx, re.I):
            return True, "…" + re.sub(r"\s+", " ", ctx[max(0, window - 50): window + len(val) + 50]) + "…"
    return False, f"{val} never appears within {window} chars of /{word_re}/"


def both(*results: tuple[bool, str]) -> tuple[bool, str]:
    return all(r[0] for r in results), " | ".join(r[1] for r in results)


def either(*results: tuple[bool, str]) -> tuple[bool, str]:
    ok = [r for r in results if r[0]]
    return (True, ok[0][1]) if ok else (False, " | ".join(r[1] for r in results))


def rx(c: str, pattern: str) -> tuple[bool, str]:
    m = re.search(pattern, c, re.I | re.S)
    return (True, "…" + re.sub(r"\s+", " ", c[max(0, m.start() - 40): m.end() + 40]) + "…") if m else (False, f"no match for /{pattern}/")


def pngs(files: list[Path], pattern: str) -> tuple[bool, str]:
    hit = [p for p in files if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".pdf") and re.search(pattern, str(p), re.I)]
    return bool(hit), f"{len(hit)} files, e.g. {hit[0].name}" if hit else f"no image matching /{pattern}/"


def assets(files: list[Path], pattern: str, exts: tuple[str, ...]) -> tuple[bool, str]:
    hit = [p for p in files if p.suffix.lower() in exts and re.search(pattern, str(p), re.I)]
    return bool(hit), f"{hit[0].name}" if hit else f"no {exts} file matching /{pattern}/"


CVD = r"deuteran|protan|tritan|colou?r[- ]?blind|colou?r[- ]vision|\bCVD\b"
PALETTES = ("categorical", "sequential", "diverging", "context")
MANUAL = None


def checks(eval_id: int, c: str, h: str, files: list[Path]) -> list:
    if eval_id == 1:
        return [
            both(near(c, r"\bbg\b|background|paper|canvas", "#F3EFE4"), near(c, r"\bfg\b|text|ink|foreground", "#14261C")),
            both(near(c, r"accent|primary|brand", "#2E7D4F"), has(c, "#1E4D36")),
            near(c, r"inverse|dark", "#14261C", 160),
            both(near(c, r"gradient", "#1E4D36", 300), near(c, r"gradient", "#2E7D4F", 300)),
            has(c, "Playfair Display", "Source Sans 3"),
            MANUAL,
            has(c, "#F2C14E"),
            has(c, "#2E7D4F", "#D9A441", "#3C6E91"),
            has(c, "#D8D2C2"),
            has(c, *PALETTES),
            rx(c, CVD),
            rx(c, r"licen[cs]e|OFL|fontsource"),
            pngs(files, r"specimen|slide|kitchen|preview"),
            MANUAL,
            MANUAL,
            MANUAL,
            MANUAL,
            MANUAL,
            MANUAL,
        ]
    if eval_id == 2:
        return [
            has(c, "#F7F4EE", "#0F1B2D", "#FF5A36", "#7A2CF5", "#12B5A5", "#5B6472"),
            both(near(c, r"gradient", "#FF5A36", 300), near(c, r"gradient", "#7A2CF5", 300), rx(c, r"135")),
            MANUAL,
            both(rx(c, r"subset"), rx(c, r"fontsource|google fonts|OFL")),
            both(rx(c, r"\b120\b"), rx(c, r"\b72\b"), rx(c, r"\b32\b")),
            both(near(c, r"inverse|dark", "#0F1B2D", 160), rx(c, r"surfaces?[^\n]{0,400}gradient|gradient[^\n]{0,80}surface|\"gradient\"\s*:\s*\{")),
            has(c, "#C9C3B6", "#D9D4C7"),
            rx(c, r"highlight"),
            has(c, *PALETTES),
            rx(c, CVD),
            rx(c, r"2\.8\d?\s*:\s*1|3\.1\d?\s*:\s*1|2\.3\d?\s*:\s*1|2\.8[0-9]?\b|3\.10?\b"),
            assets(files, r"logo|chrome|mark|wordmark", (".svg", ".png")),
            pngs(files, r"specimen|slide|kitchen|preview"),
            either(pngs(files, r"compar|side|diff|versus|vs"), rx(h, r"page\s*\d+[^\n]{0,60}(specimen|slide)")),
            MANUAL,
            MANUAL,
            MANUAL,
            MANUAL,
            MANUAL,
        ]
    if eval_id == 3:
        return [
            has(c, "#F7F4EE", "#0F1B2D", "#FF5A36", "#7A2CF5", "#12B5A5", "#5B6472"),
            both(near(c, r"gradient", "#FF5A36", 300), near(c, r"gradient", "#7A2CF5", 300), rx(c, r"135")),
            both(has(c, "Space Grotesk", "Inter", "JetBrains Mono"), rx(c, r"licen[cs]e|OFL|fontsource")),
            MANUAL,
            both(rx(c, r"\b24\b"), rx(c, r"pill|999|9999")),
            either(rx(c, r"0\.2,\s*0\.8,\s*0\.2,\s*1"), rx(c, r"180\s*ms|\b180\b|0\.18s")),
            near(c, r"inverse|dark", "#0F1B2D", 160),
            assets(files, r"logo|mark|wordmark", (".svg",)),
            both(has(c, "#C9C3B6"), rx(c, r"highlight|context")),
            has(c, *PALETTES),
            rx(c, CVD),
            rx(c, r"3\.1\d?\s*:\s*1|2\.8\d?\s*:\s*1|\b3\.10?\b|\b2\.83?\b"),
            pngs(files, r"specimen|slide|kitchen|preview"),
            MANUAL,
            MANUAL,
            MANUAL,
            MANUAL,
            MANUAL,
        ]
    if eval_id == 4:
        return [
            both(has(c, "#F7F4EE", "#0F1B2D"), either(has(c, "#FF5A36"), has(c, "#F8532F"))),
            MANUAL,
            MANUAL,
            MANUAL,
            both(has(c, "categorical", "sequential", "diverging"), rx(c, r"derived|generated|chosen|guess")),
            MANUAL,
            MANUAL,
            MANUAL,
        ]
    if eval_id == 5:
        return [
            MANUAL,
            MANUAL,
            both(has(c, "Verdana"), rx(c, r"DejaVu|Open Sans|Noto Sans|Fontsource|system font")),
            MANUAL,
            rx(c, r"4:3|4 ?x ?3|1\.33"),
            MANUAL,
            MANUAL,
            MANUAL,
        ]
    raise SystemExit(f"no programmatic checks defined for eval {eval_id}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval", type=int, required=True)
    ap.add_argument("--run", type=Path, required=True)
    args = ap.parse_args()
    ev = next(e for e in json.loads((HERE / "evals.json").read_text())["evals"] if e["id"] == args.eval)
    corpus, handover, files = load(args.run)
    manual_path = args.run / "manual_grades.json"
    manual = json.loads(manual_path.read_text()) if manual_path.exists() else {}
    results = []
    for i, (text, res) in enumerate(zip(ev["expectations"], checks(args.eval, corpus, handover, files))):
        if str(i) in manual:
            passed, evidence = manual[str(i)]["passed"], "[reviewer] " + manual[str(i)]["evidence"]
        elif res is MANUAL:
            passed, evidence = False, "needs a reviewer: no manual grade recorded"
        else:
            passed, evidence = res[0], "[script] " + res[1][:260]
        results.append({"text": text, "passed": bool(passed), "evidence": evidence})
    n_pass = sum(r["passed"] for r in results)
    grading = {"expectations": results, "summary": {"passed": n_pass, "failed": len(results) - n_pass, "total": len(results), "pass_rate": round(n_pass / len(results), 3)}}
    timing = args.run / "timing.json"
    if timing.exists():
        t = json.loads(timing.read_text())
        grading["timing"] = {"total_duration_seconds": t.get("total_duration_seconds")}
    (args.run / "grading.json").write_text(json.dumps(grading, indent=2, ensure_ascii=False))
    for r in results:
        print(("PASS " if r["passed"] else "FAIL ") + r["text"][:90] + "\n       " + r["evidence"][:200])
    print(grading["summary"])


if __name__ == "__main__":
    main()
