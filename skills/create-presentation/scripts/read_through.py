#!/usr/bin/env python3
"""Read-through of a deck's argument: the checks `deckster lint` does not make.

`deckster lint` measures the rendered slides (overflow, budgets, contrast,
chart and diagram rules, missing notes, repeated layouts, the time budget).
This script reads the slide files and reports on the argument instead:

  - the titles in deck order, so you can read the story top to bottom
  - titles that read as a topic label instead of a claim
  - speaker notes that are missing, thin, or longer than the slide's budget
  - slides without a budget, and the total against the deck's duration
    (hidden slides, `hidden: true`, are backups: they need no budget and
    are left out of the total, as in `deckster lint`)
  - a closing slide that only says thanks
  - every [NEEDS: ...] placeholder, for the handoff

Usage:
    read_through.py <deck-dir> [--json]

Slide order and duration come from deck.config.ts: the `slides` list and the
`duration` of the `defineDeck({...})` literal, read with a small tokenizer that
skips comments and strings (the deck CLI has no command that prints the slide
list without rendering; `deckster lint <deck> --json` is the authority on the
deck itself). Exit code 1 when a content slide has a label-style title or no
notes; exit code 2 when the config lists no slides or cannot be read, so an
empty read-through never passes.
"""

import argparse
import json
import re
import sys
from pathlib import Path

WPM = 150
# Layouts whose title is a name by design.
STRUCTURAL = {"title", "section", "closing", "agenda", "logos", "team"}

TOPIC_TITLES = {
    "agenda", "overview", "introduction", "intro", "background", "context",
    "summary", "conclusion", "conclusions", "results", "findings", "analysis",
    "next steps", "roadmap", "architecture", "the problem", "problem",
    "the solution", "solution", "our solution", "demo", "questions", "q&a",
    "thank you", "thanks", "team", "the team", "market", "market size",
    "competition", "traction", "business model", "financials", "the ask",
    "key takeaways", "takeaways", "recap", "objectives", "goals", "timeline",
    "pricing", "features", "benefits", "about us", "why now", "why us",
    "challenges", "opportunities", "approach", "methodology", "data",
    "metrics", "update", "status", "risks", "appendix", "discussion",
}

VERB_HINT = re.compile(
    r"\b(is|are|was|were|be|been|has|have|had|do|does|did|can|could|will|would|"
    r"should|must|may|might|need|needs|lets?|make|makes|made|take|takes|took|"
    r"give|gives|gave|get|gets|got|cut|cuts|grew|grow|grows|fell|fall|falls|"
    r"rose|rise|rises|drop|drops|dropped|doubled?|tripled?|halved?|beat|beats|"
    r"win|wins|won|lose|loses|lost|cost|costs|save|saves|saved|run|runs|ran|"
    r"start|starts|stop|stops|go|goes|went|come|comes|came|pass|passes|"
    r"\w+ed|\w+es|\w+s)\b",
    re.IGNORECASE,
)


def parse_budget(value: str):
    m = re.fullmatch(r"(?=\d)(?:(\d+)m)?(?:(\d+)s)?", value.strip())
    if not m:
        return None
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


def frontmatter_of(text: str, tsx: bool) -> dict:
    meta = {}
    if tsx:
        # Locate the declaration before tokenizing its literal. The rest of a TSX
        # file can contain JSX text such as "It's ready", which is not a JS string.
        declarations = re.finditer(r"//[^\n]*|/\*.*?\*/|(?P<declaration>\bexport\s+const\s+frontmatter\b)", text, re.DOTALL)
        declaration = next((match for match in declarations if match.group("declaration")), None)
        if declaration is None:
            return meta
        toks = tokens(text[declaration.end():])
        start = 0
        if toks[start:start + 1] == [("punct", ":")]:
            # An optional type annotation precedes the literal's assignment.
            while start < len(toks) and toks[start] not in (("punct", "="), ("punct", ";")):
                start += 1
        if toks[start:start + 2] != [("punct", "="), ("punct", "{")]:
            return meta
        depth, k = 1, start + 2
        while k < len(toks) and depth:
            kind, value = toks[k]
            if kind == "punct" and value in "{[(":
                depth += 1
            elif kind == "punct" and value in "}])":
                depth -= 1
            elif depth == 1 and kind in ("word", "str") and toks[k - 1] in (("punct", "{"), ("punct", ",")):
                if (toks[k + 1:k + 2] == [("punct", ":")] and toks[k + 2:k + 3]
                        and toks[k + 2][0] == "str" and toks[k + 3:k + 4] in ([("punct", ",")], [("punct", "}")])):
                    meta[value] = toks[k + 2][1]
            k += 1
        return meta
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line and not line.startswith((" ", "\t", "#")):
                key, value = line.split(":", 1)
                meta[key.strip()] = value.strip().strip("\"'")
    return meta


REFERENCE_LABEL = re.compile(r"(?im)^\s*\**\s*(if asked[^:\n]*|listen for|proof|backup|sources?)\s*\**\s*:")
ACTIVITY_CUE = re.compile(r"\[[^\]]*(\d+\s*(?:-|to)?\s*\d*\s*(?:min|minute|second|sec)|timer|breakout|in the chat|poll|exercise|pairs|demo)[^\]]*\]", re.IGNORECASE)


def spoken_words(notes: str) -> int:
    """Words the presenter says: without [cues], and without the reference material that starts at the first
    "If asked:", "Listen for:", "Proof:" or "Sources:" line."""
    spoken = REFERENCE_LABEL.split(notes)[0]
    spoken = re.sub(r"\[[^\]]*\]", " ", spoken)
    return len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'%$.,/-]*", spoken))


def has_activity(notes: str) -> bool:
    """A bracketed cue that fills time without speech: a timed exercise, a poll, a demo."""
    return bool(ACTIVITY_CUE.search(notes))


def is_label(title: str) -> bool:
    t = title.strip().rstrip(".:!").lower()
    if not t or t in TOPIC_TITLES:
        return True
    if re.match(r"^(\w+\s+){0,2}\d+\s*[:.\-–]\s", t):
        return True
    words = t.split()
    if len(words) <= 2:
        return True
    return len(words) <= 4 and not VERB_HINT.search(t)


class ConfigError(Exception):
    """deck.config.ts does not give a usable slide list."""


SLIDE_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def tokens(source: str) -> list:
    """The config's code as tokens, ("str", value) for string literals, ("word", text) for names and numbers and
    ("punct", char) for the rest, with comments left out. Text inside a comment or a string is never code."""
    out, i, n = [], 0, len(source)
    while i < n:
        ch = source[i]
        if ch.isspace():
            i += 1
        elif source.startswith("//", i):
            end = source.find("\n", i)
            i = n if end == -1 else end
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = n if end == -1 else end + 2
        elif ch in "'\"`":
            j, value = i + 1, []
            while j < n and source[j] != ch:
                if source[j] == "\\" and j + 1 < n:
                    j += 1
                value.append(source[j])
                j += 1
            out.append(("str", "".join(value)))
            i = j + 1
        elif ch.isalnum() or ch in "_$":
            j = i
            while j < n and (source[j].isalnum() or source[j] in "_$"):
                j += 1
            out.append(("word", source[i:j]))
            i = j
        else:
            out.append(("punct", ch))
            i += 1
    return out


def read_config(source: str) -> dict:
    """The slide ids and the duration from the top level of `export default defineDeck({ ... })`."""
    toks = tokens(source)
    start = next((k for k in range(len(toks) - 2) if toks[k] == ("word", "defineDeck") and toks[k + 1] == ("punct", "(") and toks[k + 2] == ("punct", "{")), None)
    if start is None:
        raise ConfigError("deck.config.ts has no `defineDeck({ ... })`.")
    depth, k, slides, duration = 0, start + 2, None, None
    while k < len(toks):
        kind, value = toks[k]
        if kind == "punct" and value in "{[(":
            depth += 1
        elif kind == "punct" and value in "}])":
            depth -= 1
            if depth == 0:
                break
        elif depth == 1 and kind in ("word", "str") and toks[k + 1:k + 2] == [("punct", ":")] and toks[k - 1] in (("punct", "{"), ("punct", ",")):
            if value == "slides" and slides is None:
                if toks[k + 2:k + 3] != [("punct", "[")]:
                    raise ConfigError("`slides` in deck.config.ts is not a list written in place.")
                slides, k = [], k + 3
                while k < len(toks) and toks[k] != ("punct", "]"):
                    if toks[k][0] == "str":
                        slides.append(toks[k][1])
                    elif toks[k] != ("punct", ","):
                        raise ConfigError("`slides` in deck.config.ts must list slide ids as plain strings.")
                    k += 1
                k += 1  # The list was consumed here; its closing bracket must not lower the object depth.
                continue
            if value == "duration" and toks[k + 2:k + 3] and toks[k + 2][0] == "str":
                duration = toks[k + 2][1]
        k += 1
    if not slides:
        raise ConfigError("deck.config.ts lists no slides, so there is nothing to read through.")
    bad = [s for s in slides if not SLIDE_ID.match(s)]
    if bad:
        raise ConfigError(f"Slide ids are kebab-case file names; deck.config.ts lists {bad[0][:40]!r}.")
    return {"slides": slides, "duration": duration}


def load(deck: Path) -> dict:
    config = read_config((deck / "deck.config.ts").read_text(encoding="utf-8"))
    ids = config["slides"]
    slides = []
    for slide_id in ids:
        path = next((deck / "slides" / f"{slide_id}{ext}" for ext in (".mdx", ".tsx") if (deck / "slides" / f"{slide_id}{ext}").is_file()), None)
        if path is None:
            slides.append({"id": slide_id, "missing": True})
            continue
        text = path.read_text(encoding="utf-8")
        meta = frontmatter_of(text, path.suffix == ".tsx")
        notes = re.search(r"<Notes>(.*?)</Notes>", text, re.DOTALL)
        notes_text = notes.group(1).strip() if notes else ""
        slides.append({
            "id": slide_id,
            "file": str(path.relative_to(deck)),
            "layout": meta.get("layout", "default"),
            "title": meta.get("title", ""),
            "surface": meta.get("surface", ""),
            "budget": parse_budget(meta.get("budget", "")),
            "hidden": str(meta.get("hidden", "")).strip().lower() == "true",
            "notes_words": spoken_words(notes_text),
            "has_notes": bool(notes_text),
            "activity": has_activity(notes_text),
            "needs": re.findall(r"\[NEEDS:[^\]]*\]", text),
        })
    return {"duration": parse_budget(config["duration"]) if config["duration"] else None, "slides": slides}


def check(deck: dict) -> list:
    findings = []

    def add(slide, level, message):
        findings.append({"slide": slide["id"] if slide else "(deck)", "level": level, "message": message})

    slides = [s for s in deck["slides"] if not s.get("missing")]
    for s in deck["slides"]:
        if s.get("missing"):
            add(s, "error", "Listed in deck.config.ts but there is no slide file.")
    for s in slides:
        structural = s["layout"] in STRUCTURAL
        if not structural and s["layout"] != "statement" and is_label(s["title"]):
            add(s, "error", f"Title \"{s['title']}\" reads as a topic label. State the slide's claim as a sentence.")
        if not s["has_notes"]:
            add(s, "error", "No speaker notes.")
        if s["budget"] is None:
            if not s["hidden"]:
                add(s, "warn", "No `budget` in the frontmatter, so the time budget cannot be checked.")
        elif s["has_notes"]:
            fits = s["budget"] / 60 * WPM
            if s["notes_words"] > fits * 1.15:
                add(s, "warn", f"Notes script is {s['notes_words']} words for a {s['budget']}s budget (about {int(fits)} fit). Cut the script or raise the budget.")
            elif not structural and not s["activity"] and s["budget"] >= 60 and s["notes_words"] < fits * 0.25:
                add(s, "warn", f"Notes script is {s['notes_words']} words for a {s['budget']}s budget: the presenter has little to say. Write the talk track, or name the activity that fills the time as a bracketed cue such as [3 minutes: answers in the chat].")
    shown = [s for s in slides if not s["hidden"]]
    total = sum(s["budget"] or 0 for s in shown)
    if deck["duration"] is None:
        add(None, "warn", "deck.config.ts has no `duration`, so nothing checks that the talk fits its slot.")
    elif total > deck["duration"]:
        add(None, "error", f"Budgets total {total // 60}m{total % 60:02d}s, more than the deck's {deck['duration'] // 60}m.")
    elif total > deck["duration"] * 0.96 and not any(s["activity"] for s in shown):
        add(None, "warn", f"Budgets total {total // 60}m{total % 60:02d}s of {deck['duration'] // 60}m: no slack. Fine when `duration` is only the presenting share of a longer meeting; otherwise cut.")
    if shown and re.fullmatch(r"(thank you|thanks|questions\??|q&a|the end)[.!]?", shown[-1]["title"].strip().lower() or "thanks"):
        add(shown[-1], "warn", "The closing slide stays up during Q&A: give it the takeaway and the next step, not thanks.")
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("deck", type=Path, help="Deck directory, such as decks/q3-review")
    parser.add_argument("--json", action="store_true", help="Print JSON")
    args = parser.parse_args()
    if not (args.deck / "deck.config.ts").is_file():
        print(f"No deck.config.ts in {args.deck}", file=sys.stderr)
        return 2

    try:
        deck = load(args.deck)
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    findings = check(deck)
    slides = [s for s in deck["slides"] if not s.get("missing")]
    total = sum(s["budget"] or 0 for s in slides if not s["hidden"])
    needs = [(s["id"], n) for s in slides for n in s["needs"]]
    errors = sum(1 for f in findings if f["level"] == "error")

    if args.json:
        print(json.dumps({"duration": deck["duration"], "budgetTotal": total, "slides": deck["slides"], "findings": findings, "needs": needs}, indent=2))
        return 1 if errors else 0

    duration = f" of {deck['duration'] // 60}m" if deck["duration"] else ""
    print(f"{len(slides)} slides, budgets total {total // 60}m{total % 60:02d}s{duration}\n")
    print("Read-through: do the titles alone tell the argument?")
    for n, s in enumerate(slides, 1):
        budget = f"{s['budget']}s" if s["budget"] is not None else "-"
        hidden = " (hidden)" if s["hidden"] else ""
        print(f"  {n:>2}. [{s['layout']:<9} {budget:>5}] {s['title'] or '(no title)'}{hidden}")
    if findings:
        print()
        for f in findings:
            print(f"  [{f['level']:<5}] {f['slide']}: {f['message']}")
    if needs:
        print("\nPlaceholders to list in the handoff:")
        for slide_id, text in needs:
            print(f"  {slide_id}: {text}")
    print(f"\n{errors} error(s), {len(findings) - errors} warning(s). This reads text only; run `deckster lint` and look at `deckster shot` for everything visual.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
