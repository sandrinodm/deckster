"""Brand layouts for the importer: the deterministic part.

A PowerPoint template's slide layouts become the brand's own layouts (`brands/<name>/layouts.ts`, schema in
packages/brand/src/schema/layout-schema.ts). This module holds what needs no judgement:

- `plan_canvas`   source points to the 1920x1080 canvas: pt to px, the 4:3 rule (uniform scale to the canvas
                  height and centred, or `stretch` for art-less layouts)
- `snap_step`     a font size to the nearest brand type step, with the 15% rule
- `propose`       the starting `layouts[]` of a draft: one spec per source layout, with the kit layout it
                  falls back to chosen by the framework's own compatibility rules, bindings by the plan's
                  placeholder table, duplicates across masters merged with surface-keyed art, kebab names
                  with the brand prefix on a clash
- `check_specs`   the same rules `deck brand check` applies to layouts (a port of `checkBrandLayouts` and
                  `checkLayouts`), run on the draft against the catalog from `deck layouts --json`
- `spec_to_module_value` a draft spec as the value `layouts.ts` holds

The agent reviews every choice: names, fallbacks, bindings, duplicates. Standard library only.
"""
from __future__ import annotations

import json
import math
import os
import re
import shlex
import subprocess
from pathlib import Path

import _common as C
import _filesafe as F
import _tsdata as T

CANVAS_W, CANVAS_H = 1920, 1080
MIN_BOX = 40
MAX_REGIONS = 12
MAX_LAYOUTS = 64
MIN_TYPE_SIZE = 20
SNAP_TOLERANCE = 0.15  # a size farther than this from every type step goes to the notes, not to a step
KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FIELD = re.compile(r"^[a-z][a-zA-Z0-9]*$")
SLOT = FIELD  # the engine's SLOT_NAME_PATTERN: lowerCamelCase, as `aside` or `pullQuote`
ART_EXTENSIONS = ("svg", "png", "webp", "jpg", "jpeg")
MAX_ART_BYTES = 8 * 1024 * 1024

TYPE_STEPS = ("display", "headline", "title", "lead", "body", "small", "caption", "label", "stat", "quote", "code")
ROLE_NAMES = ("bg", "surface", "fg", "heading", "muted", "accent", "accent-fg", "border", "positive", "negative")
REQUIRED_SURFACES = ("default", "inverse", "accent", "gradient")
# Draft step names accepted for each framework step (the same table emit_brand.py uses).
STEP_SOURCES = {
    "display": ("display",), "headline": ("headline", "h1"), "title": ("title", "h2", "h3"), "lead": ("lead", "lede", "subtitle"),
    "body": ("body",), "small": ("small",), "caption": ("caption", "stat_label"), "label": ("eyebrow", "label"),
    "stat": ("stat",), "quote": ("quote",), "code": ("code",),
}
TITLE_STEPS = ("display", "headline", "title")
TEXT_STEPS = ("lead", "body", "small", "caption", "label")
TEXT_KINDS = {"heading", "text", "bullets", "quote", "number", "code"}
MEDIA_KINDS = {"image", "video", "chart", "diagram", "component"}
# The kit layout to try first for each OOXML layout type, then for what the layout holds.
PREFERRED = {
    "title": ["title"], "secHead": ["section"], "obj": ["content"], "twoObj": ["content", "split"], "titleOnly": ["section", "content"],
    "picTx": ["split", "image"], "blank": ["default"], "tbl": ["table", "chart", "content"], "chart": ["chart", "content"],
    "objAndTx": ["split", "content"], "txAndObj": ["split", "content"], "twoTxTwoObj": ["content"], "cust": [],
}
CHROME_TYPES = ("sldNum", "dt", "ftr")
ALIGN = {"l": "start", "ctr": "center", "r": "end"}
ANCHOR = {"t": "start", "ctr": "center", "b": "end"}


def kebab(text, fallback: str = "layout") -> str:
    out = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")
    return out[:48].strip("-") or fallback


def cap(text, limit: int) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f  ]", " ", str(text or ""))).strip()[:limit]


# ---------------------------------------------------------------------------- catalog


def parse_json_output(text: str) -> dict:
    """The JSON object in command output that may start with log lines (pnpm prints some)."""
    start = text.index("\n{") + 1 if "\n{" in text else text.index("{")
    return json.loads(text[start:])


def deck_command() -> list[str]:
    """The command that runs `deck`: $DECK_CMD (for example `pnpm deck` in a framework checkout) or `deck`."""
    return shlex.split(os.environ.get("DECK_CMD") or "deck")


def load_catalog(path: Path | None, workspace: Path | None = None) -> dict[str, dict]:
    """The layout catalog by name, from a saved `deck layouts <deck> --json` or by running it in the workspace
    (any deck there will do: the kit's layouts are the same in all). Raises RuntimeError when neither works."""
    if path is not None:
        data = parse_json_output(Path(path).read_text(encoding="utf-8"))
    else:
        ws = Path(workspace or ".")
        decks = sorted(p.name for p in (ws / "decks").glob("*") if (p / "deck.config.ts").exists()) if (ws / "decks").is_dir() else []
        if not decks:
            raise RuntimeError("no catalog: pass --catalog <file from `deck layouts <deck> --json`>, or run in a workspace that has a deck")
        run = subprocess.run([*deck_command(), "layouts", "hello" if "hello" in decks else decks[0], "--json"], capture_output=True, text=True, cwd=ws)
        if run.returncode != 0:
            raise RuntimeError(f"`deck layouts` failed: {(run.stdout + run.stderr)[-300:]}")
        data = parse_json_output(run.stdout)
    return {layout["name"]: layout for layout in data["layouts"]}


def kit_layouts(catalog: dict[str, dict]) -> dict[str, dict]:
    """The layouts a brand layout may fall back to: everything except other brands' layouts."""
    return {name: lay for name, lay in catalog.items() if not str(lay.get("source", "")).startswith("brand:")}


def required_fields(layout: dict) -> list[str]:
    return [name for name, spec in (layout.get("fields") or {}).items() if spec.get("required")]


def is_text_field(layout: dict, field: str) -> bool:
    """Whether a text region can draw the field: its JSON schema type is a string or a number, or a union of only
    those (the framework's `isTextField`). Structured fields (stats, items, cards...) are not text."""
    prop = (((layout.get("frontmatter") or {}).get("properties") or {}).get(field))
    if not isinstance(prop, dict):
        return True  # no schema to judge by (a catalog without frontmatter): assume text

    def text(node) -> bool:
        if not isinstance(node, dict):
            return False
        for key in ("anyOf", "oneOf"):
            if key in node:
                return all(text(n) for n in node[key])
        t = node.get("type")
        if isinstance(t, list):
            return all(x in ("string", "number", "integer") for x in t)
        if t in ("string", "number", "integer"):
            return True
        return t is None and "enum" in node and all(isinstance(v, (str, int, float)) and not isinstance(v, bool) for v in node["enum"])

    return text(prop)


def required_slots(layout: dict) -> list[str]:
    return [name for name, spec in (layout.get("slots") or {}).items() if spec.get("required")]


# ---------------------------------------------------------------------------- canvas


def plan_canvas(source: dict, rule: str = "auto") -> dict:
    """How source coordinates land on the canvas. `source` is extraction.json's `source`.

    - 16:9 (or within 1%): `native`, boxes and sizes scale by 1920/width.
    - any other aspect, `uniform` (default): everything scales by the same factor to the canvas height (or width,
      for a wider source) and is centred, so art and boxes stay registered; the bands show the surface.
    - `stretch`: boxes map proportionally on each axis and sizes scale by 1920/width, so text reflows in the
      wider boxes. Only for layouts with no art (the caller decides); the plan is the same either way.
    """
    page_w = source["page_size"]["width_pt"]
    page_h = source["page_size"]["height_pt"]
    aspect = page_w / page_h
    native = abs(aspect - CANVAS_W / CANVAS_H) < 0.01 * (CANVAS_W / CANVAS_H)
    return {"aspect": aspect, "page_w_pt": page_w, "page_h_pt": page_h, "native": native, "rule": "native" if native else ("stretch" if rule == "stretch" else "uniform")}


def _uniform_frame(plan: dict) -> tuple[float, float, float, float]:
    """(width, height, offset_x, offset_y) in canvas pixels of the scaled source page."""
    aspect = plan["aspect"]
    if aspect <= CANVAS_W / CANVAS_H:
        w, h = CANVAS_H * aspect, CANVAS_H
    else:
        w, h = CANVAS_W, CANVAS_W / aspect
    return w, h, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2


def to_box(plan: dict, frac: list[float], rule: str | None = None) -> list[int]:
    """A source box (fractions of the page: x, y, w, h) as canvas pixels, inside the canvas and at least 40 px."""
    rule = rule or plan["rule"]
    if rule in ("native", "stretch"):
        x, y, w, h = frac[0] * CANVAS_W, frac[1] * CANVAS_H, frac[2] * CANVAS_W, frac[3] * CANVAS_H
    else:
        fw, fh, ox, oy = _uniform_frame(plan)
        x, y, w, h = ox + frac[0] * fw, oy + frac[1] * fh, frac[2] * fw, frac[3] * fh
    w, h = max(MIN_BOX, round(w)), max(MIN_BOX, round(h))
    x, y = min(max(0, round(x)), CANVAS_W - w), min(max(0, round(y)), CANVAS_H - h)
    return [x, y, min(w, CANVAS_W), min(h, CANVAS_H)]


def to_px(plan: dict, size_pt: float, rule: str | None = None) -> float:
    """A font size in points as canvas pixels: the box factor for native and uniform, 1920/width for stretch."""
    rule = rule or plan["rule"]
    if rule == "stretch":
        return size_pt * CANVAS_W / plan["page_w_pt"]
    fw, fh, _, _ = _uniform_frame(plan)
    return size_pt * (fh / plan["page_h_pt"])


# ---------------------------------------------------------------------------- type steps


def brand_steps(draft: dict | None) -> dict[str, float]:
    """The brand's type steps as {framework step: px} from the draft's typography.scale (draft or framework names)."""
    scale = ((draft or {}).get("typography") or {}).get("scale") or {}
    out: dict[str, float] = {}
    for step, names in STEP_SOURCES.items():
        for n in names:
            size = (scale.get(n) or {}).get("size")
            if isinstance(size, (int, float)) and size > 0:
                out[step] = float(max(size, MIN_TYPE_SIZE))
                break
    return out


def snap_step(px: float, steps: dict[str, float], role: str) -> tuple[str | None, float | None]:
    """The nearest type step for a size among the steps that suit the role (title: display, headline, title; text:
    lead, body, small, caption, label). Text never falls through to a heading step: body text is not a display
    heading however large the template set it. Returns (step, relative difference); step is None when no suitable
    step is within 15%, and the difference then says how far the nearest one is (None when the role has no step)."""
    pool = [x for x in (TITLE_STEPS if role == "title" else TEXT_STEPS) if x in steps]
    if not pool:
        return None, None
    best = min(pool, key=lambda x: abs(math.log(px / steps[x])))
    diff = abs(px - steps[best]) / steps[best]
    return (best if diff <= SNAP_TOLERANCE else None), round(diff, 3)


# ---------------------------------------------------------------------------- binding


def _reading_order(phs: list[dict]) -> list[dict]:
    def key(p):
        b = p["bbox"] or [0, 0, 0, 0]
        return (round(b[1] / 0.08), b[0])  # rows within 8% of the page height count as one row

    return sorted(phs, key=key)


def _idx(ph: dict) -> int:
    try:
        return int(ph.get("idx_declared") or 0)
    except (TypeError, ValueError):
        return 0


def role_of(ph: dict) -> str:
    """title, subtitle, body, picture, chart, table, diagram, media or chrome: what a placeholder is for."""
    t = ph["type"]
    if t in ("title", "ctrTitle"):
        return "title"
    if t == "subTitle":
        return "subtitle"
    if t in CHROME_TYPES:
        return "chrome"
    if t == "pic":
        return "picture"
    if t in ("chart", "tbl", "dgm", "media"):
        return {"chart": "chart", "tbl": "table", "dgm": "diagram", "media": "media"}[t]
    return "body"  # body, obj, and the vertical/half variants


def _slot_accepts(layout: dict, slot: str) -> set[str]:
    return set(((layout.get("slots") or {}).get(slot) or {}).get("accepts") or [])


def assign(phs: list[dict], fallback: dict) -> dict:
    """Bind a layout's non-chrome placeholders to a fallback's title, slots and fields. Returns
    {"title": ph|None, "regions": [(ph, bind, kind)], "dropped": [(ph, why)]}. A placeholder the fallback has
    no place for is dropped with the reason."""
    slots = list((fallback.get("slots") or {}).keys())
    taken: set[str] = set()
    out: dict = {"title": None, "regions": [], "dropped": []}
    ordered = _reading_order([p for p in phs if role_of(p) != "chrome"])
    has_title = fallback.get("title") is not None

    def free_text_slot() -> str | None:
        for s in slots:
            if s in taken or s == "media":
                continue
            accepts = _slot_accepts(fallback, s)
            if s == "body" and not accepts:
                accepts = {"text"}
            if accepts & TEXT_KINDS or s == "body":
                return s
        return None

    for ph in ordered:
        role = role_of(ph)
        if role == "title":
            if out["title"] is None and has_title:
                out["title"] = ph
            else:
                out["dropped"].append((ph, "the fallback has no title" if not has_title else "a second title"))
        elif role in ("body", "subtitle"):
            slot = "body" if role == "body" and "body" in slots and "body" not in taken else free_text_slot()
            if slot is None and role == "subtitle":
                field = next((f for f in ("byline", "eyebrow", "subtitle") if f in (fallback.get("fields") or {}) and f not in taken), None)
                if field:
                    taken.add(field)
                    out["regions"].append((ph, {"field": field}, "text"))
                    continue
            if slot is None:
                out["dropped"].append((ph, "the fallback has no free text slot"))
                continue
            taken.add(slot)
            out["regions"].append((ph, {"slot": slot}, "text"))
        elif role in ("picture", "chart", "table", "diagram", "media"):
            want = {"picture": "image", "chart": "chart", "table": "table", "diagram": "diagram", "media": "video"}[role]
            slot = next((s for s in slots if s not in taken and want in _slot_accepts(fallback, s) and (s == "media" or role != "picture")), None)
            if slot is None:
                slot = next((s for s in slots if s not in taken and want in _slot_accepts(fallback, s)), None)
            if slot is None:
                out["dropped"].append((ph, f"the fallback has no slot that accepts a {want}"))
                continue
            taken.add(slot)
            out["regions"].append((ph, {"slot": slot}, "media" if role in ("picture", "media") else "content"))
    return out


def problems_for(bound: dict, fallback: dict, has_title_box: bool) -> tuple[list[str], list[str]]:
    """What stops a binding from being valid on its fallback (the rules of `checkBrandLayouts`), and the structured
    required fields the layout has to take with `fields` (a text region cannot draw them)."""
    errors = []
    taken: list[str] = []
    slots = {b["slot"] for _, b, _ in bound["regions"] if "slot" in b}
    fields = {b["field"] for _, b, _ in bound["regions"] if "field" in b}
    for s_ in required_slots(fallback):
        if s_ not in slots:
            errors.append(f"requires slot {s_}")
    for f in required_fields(fallback):
        if f in fields:
            continue
        if is_text_field(fallback, f):
            errors.append(f"requires field {f}")
        else:
            taken.append(f)
    if (fallback.get("title") or {}).get("required") and not has_title_box:
        errors.append("requires a title")
    return errors, taken


def infer_preferred(phs: list[dict]) -> list[str]:
    """The kit layouts to try first for a layout with no (or a custom) OOXML type, from what it holds."""
    roles = [role_of(p) for p in phs]
    title = "title" in roles
    pics = roles.count("picture")
    bodies = roles.count("body")
    if "chart" in roles:
        return ["chart", "content"]
    if "table" in roles:
        return ["table", "content"]
    if pics:
        return ["split", "image"]
    if any(p["type"] == "ctrTitle" for p in phs) and "subtitle" in roles:
        return ["title"]
    if title and bodies:
        return ["content"]
    if title:
        return ["section"]
    return ["default"]


def choose_fallback(lo: dict, kit: dict[str, dict], catalog_note: list[str]) -> tuple[str | None, dict | None, list[str]]:
    """The kit layout a source layout falls back to: valid ones (every required slot and field bound, a title when
    one is required, nothing bound that the fallback lacks), ranked by the OOXML layout type's preferred names,
    then by how few placeholders are dropped. Returns (name, assignment, notes); name is None when nothing fits."""
    phs = [p for p in lo.get("placeholders", [])]
    preferred = PREFERRED.get(lo.get("type") or "") or infer_preferred(phs)
    scored = []
    for order, (name, fb) in enumerate(kit.items()):
        bound = assign(phs, fb)
        synthesized = []
        errs, taken_fields = problems_for(bound, fb, bound["title"] is not None)
        # a required body the source has no placeholder for is made up, so a layout with art and no text still works
        if errs == ["requires slot body"]:
            synthesized = ["body"]
            errs = []
        if errs:
            continue
        rank = preferred.index(name) if name in preferred else len(preferred)
        bound["fields"] = taken_fields
        scored.append((len(synthesized), len(taken_fields), rank, len(bound["dropped"]), order, name, bound, synthesized))
    if not scored:
        return None, None, ["no kit layout accepts this layout's placeholders (required slots or fields cannot be bound)"]
    scored.sort(key=lambda s: s[:5])  # a fallback that needs nothing made up beats one that fits the type name better
    name, bound, synthesized = scored[0][5:]
    notes = []
    if bound.get("fields"):
        notes.append(f"the fallback {name} requires structured field(s) {', '.join(bound['fields'])}: the layout takes them in `fields` and the slide supplies them")
    if synthesized:
        notes.append(f"the fallback {name} requires a body the source layout does not have; a body region was added over the content area")
    bound["synthesized"] = synthesized
    return name, bound, notes


# ---------------------------------------------------------------------------- surfaces


def declared_hex(bg: dict | None) -> str | None:
    """A solid background's hex, or the first stop of a gradient (enough to tell dark from light)."""
    if not isinstance(bg, dict):
        return None
    if bg.get("hex"):
        return bg["hex"]
    for stop in bg.get("stops") or []:
        if stop.get("hex"):
            return stop["hex"]
    return None


def surface_for(background_hex: str | None, surfaces: dict[str, dict]) -> tuple[str, float | None]:
    """The draft surface whose background is nearest the layout's rendered background, with the colour distance
    (None when no surface has a plain hex background)."""
    if not background_hex:
        return "default", None
    best: tuple[float, str] | None = None
    dark = _is_dark(background_hex)
    # Text roles are read per surface, so the surface must have the layout's polarity (dark background: light text).
    for same_polarity in (True, False):
        for name, spec in surfaces.items():
            bg = spec.get("bg")
            if isinstance(bg, str) and bg.startswith("#") and (not same_polarity or _is_dark(bg) == dark):
                d = C.delta_e(background_hex, bg)
                if best is None or d < best[0]:
                    best = (d, name)
        if best:
            break
    return (best[1], round(best[0], 1)) if best else ("default", None)


def _is_dark(hex_value: str) -> bool:
    r, g, b = C.hex_to_rgb(hex_value)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45


def role_for(hex_value: str | None, surface: dict | None, base_roles: dict) -> str | None:
    """The role whose colour on this surface matches a text colour exactly enough (distance under 6), else None."""
    if not hex_value:
        return None
    roles = {**{k: v for k, v in base_roles.items() if isinstance(v, str)}, **{k: v for k, v in (surface or {}).items() if isinstance(v, str)}}
    for role in ("accent", "muted", "heading", "fg"):  # accent-fg is for text on accent fills, so a text colour never maps to it
        v = roles.get(role)
        if isinstance(v, str) and v.startswith("#") and C.delta_e(hex_value, v) < 6:
            return role.replace("_", "-")
    return None


# ---------------------------------------------------------------------------- propose


def _signature(lo: dict) -> tuple:
    phs = [p for p in lo.get("placeholders", []) if role_of(p) != "chrome"]
    return tuple(sorted((role_of(p), tuple(round(v, 2) for v in (p["bbox"] or [0, 0, 0, 0]))) for p in phs))


def _description(lo: dict, bound: dict) -> str:
    parts = []
    if bound["title"] is not None:
        parts.append("a title")
    kinds = []
    for ph, b, kind in bound["regions"]:
        kinds.append({"media": "a picture", "content": "an object", "text": "text"}[kind] if "slot" in b else "a line of text")
    counts = {}
    for k in kinds:
        counts[k] = counts.get(k, 0) + 1
    parts += [(f"{n} x {k}" if n > 1 else k) for k, n in counts.items()]
    what = ", ".join(parts) if parts else "decoration only"
    prompts = [f'"{cap(p["prompt"], 60)}"' for p in lo["placeholders"] if p.get("prompt")]
    extra = f' Template prompts: {"; ".join(prompts[:3])}.' if prompts else ""
    return f"The template's \"{cap(lo['name'], 60)}\" layout: {what}.{extra}"[:600]


def propose(extraction: dict, catalog: dict[str, dict], draft: dict | None, brand: str, aspect_rule: str = "auto", source_file: str | None = None) -> tuple[list[dict], list[str]]:
    """Specs for every layout in an extraction, as draft `layouts[]` entries, and notes for the agent.

    Each spec has the framework's fields (name, label, description, fallback, surface, title, regions, background,
    chrome, source) plus `key`, `keep`, `unused`, `aspect_rule`, `notes` and `art_files` for the agent and the
    emitter. A source with no layouts, or a deckster-made package, returns none."""
    notes: list[str] = []
    gen = (extraction.get("source") or {}).get("generator") or {}
    if gen.get("deckster"):
        return [], ["The package was made by the deckster export: its layouts are the kit's, so none are imported."]
    plan = plan_canvas(extraction["source"])
    steps = brand_steps(draft)
    surfaces = ((draft or {}).get("color") or {}).get("surfaces") or {}
    base_roles = ((draft or {}).get("color") or {}).get("roles") or {}
    kit = kit_layouts(catalog)
    taken_names = set(kit)
    masters = {m["part"]: m for m in extraction.get("masters", [])}
    layouts = extraction.get("layouts", [])
    if not layouts:
        return [], ["The extraction has no layouts."]
    if not steps:
        notes.append("The draft has no typography.scale yet: type steps were not assigned. Write the scale, then run propose-layouts again.")
    ordered = sorted(layouts, key=lambda l: (l.get("master_index", 0), l["key"]))
    for lo in ordered:
        lo["name"] = lo.get("name") or ""  # cSld@name is optional

    # surface per layout, from the rendered background (or the declared one when there was no render)
    def layout_surface(lo: dict) -> tuple[str, float | None]:
        """(surface, colour distance to its background). The distance is None when the page is filled by a gradient or a
        picture (kept as art, so there is no background to compare) or when nothing says what the background is."""
        art = lo.get("art") or {}
        master_bg = (masters.get(lo.get("master"), {}) or {}).get("background")
        if art.get("page_fill") and art.get("mean_color"):
            return (surface_for(art["mean_color"], surfaces)[0] if surfaces else "default"), None
        declared = declared_hex(lo.get("background")) or declared_hex(master_bg)
        bg = art.get("background") or declared
        # a gradient declared on the layout: the render's flat page rect says nothing, the stops do
        gradient = lo.get("background") and lo["background"].get("kind") == "gradient"
        if gradient and declared:
            return (surface_for(declared, surfaces)[0] if surfaces else "default"), None
        name, dist = surface_for(bg, surfaces) if surfaces else ("default", None)
        return name, dist

    groups: list[list[dict]] = []
    seen: dict[tuple, list[dict]] = {}
    for lo in ordered:
        sig = (kebab(lo["name"], "layout"), _signature(lo))
        grp = seen.get(sig)
        surf = layout_surface(lo)[0]
        if grp is not None and all(layout_surface(o)[0] != surf for o in grp) and lo.get("master_index") != grp[0].get("master_index"):
            grp.append(lo)
        else:
            seen[sig] = grp_new = [lo]
            groups.append(grp_new)
    used_names: set[str] = set()
    specs: list[dict] = []
    has_footer_ph = False
    for grp in groups:
        lo = max(grp, key=lambda l: len(l.get("used_by") or [])) if any(l.get("used_by") for l in grp) else grp[0]
        spec_notes: list[str] = []
        base = kebab(lo["name"], "layout-" + kebab(str(lo["key"]), "x"))
        name = base
        if name in taken_names:
            name = f"{kebab(brand)}-{base}"
            spec_notes.append(f'the name "{base}" is a kit or engine layout, so it was prefixed with the brand name')
        if name in used_names or name in taken_names:
            m = masters.get(lo["master"], {})
            suffix = kebab(re.sub(r"\bcolors?\b", "", str(m.get("theme_name") or ""), flags=re.I), f"m{lo.get('master_index', 1)}")
            name = f"{name}-{suffix}"
            spec_notes.append("another layout has this name with different geometry, so the master's name was added")
        n = 2
        while name in used_names or name in taken_names:
            name, n = f"{name.rsplit('-', 1)[0] if n > 2 else name}-{n}", n + 1
        used_names.add(name)

        surface, dist = layout_surface(lo)
        keep_bg = dist is not None and dist > 6 and bool((lo.get("art") or {}).get("svg_with_background"))
        if keep_bg:
            spec_notes.append(f"its background {(lo.get('art') or {}).get('background')} differs from the {surface} surface's (colour distance {dist}): kept in the art as its first layer, and the layout uses {surface} because its text polarity matches")
        fb_name, bound, fb_notes = choose_fallback(lo, kit, notes)
        spec_notes += fb_notes
        has_art = any((g.get("art") or {}).get("has_art") for g in grp)
        rule = "stretch" if (aspect_rule == "stretch" and not plan["native"] and not has_art) else plan["rule"]
        if not plan["native"]:
            spec_notes.append(f"the source is {plan['aspect']:.3f}:1: boxes and sizes use the {rule} rule" + (" (art-less layout)" if rule == "stretch" else ""))
        spec: dict = {"key": lo["key"], "keys": [g["key"] for g in grp], "sources": [{"key": g["key"], "surface": layout_surface(g)[0]} for g in grp], "name": name, "label": cap(lo["name"], 80), "unused": bool(lo.get("unused")), "aspect_rule": rule}
        spec["fallback"] = fb_name
        spec["surface"] = surface
        title: dict | bool = False
        regions: list[dict] = []
        placeholders_map: dict[str, int] = {}
        if bound is not None:
            def text_style(ph: dict, role: str) -> dict:
                lvl = (ph.get("text_styles") or {}).get("lvl1") or {}
                out: dict = {}
                if lvl.get("size_pt"):
                    px = to_px(plan, lvl["size_pt"], rule)
                    step, diff = snap_step(px, steps, role) if steps else (None, None)
                    if step:
                        out["type"] = step
                    elif steps:
                        spec_notes.append(f'{ph.get("name") or ph["type"]}: {lvl["size_pt"]} pt is {round(px)} px, more than 15% from every type step; no step set')
                if lvl.get("align") in ALIGN:
                    out["align"] = ALIGN[lvl["align"]]
                anchor = (ph.get("body") or {}).get("anchor")
                if anchor in ANCHOR:
                    out["anchor"] = ANCHOR[anchor]
                color = role_for(lvl.get("color"), surfaces.get(surface), base_roles)
                if color and color != "fg":
                    out["color"] = color
                return out

            if bound["title"] is not None:
                t = bound["title"]
                title = {"box": to_box(plan, t["bbox"], rule), **text_style(t, "title")}
                placeholders_map["title"] = _idx(t)
            for ph, bind, kind in bound["regions"]:
                region: dict = {"bind": bind, "box": to_box(plan, ph["bbox"], rule)}
                if kind == "media":
                    region["kind"] = "media"
                    region["fit"] = "cover"
                elif kind == "content":
                    region["kind"] = "content"
                else:
                    region.update(text_style(ph, "text"))
                regions.append(region)
                key = f"slot:{bind['slot']}" if "slot" in bind else f"field:{bind['field']}"
                placeholders_map[key] = _idx(ph)
            for ph, why in bound["dropped"]:
                spec_notes.append(f'placeholder "{cap(ph.get("name") or ph["type"], 40)}" ({ph["type"]}) is not bound: {why}')
            if bound.get("synthesized"):
                regions.append({"bind": {"slot": "body"}, "box": [120, 240, 1680, 720]})
        spec["title"] = title
        if bound is not None and bound.get("fields"):
            spec["fields"] = list(bound["fields"])
        spec["regions"] = regions[:MAX_REGIONS]
        if len(regions) > MAX_REGIONS:
            spec_notes.append(f"{len(regions) - MAX_REGIONS} regions past the twelfth were dropped")
        spec["description"] = _description(lo, bound) if bound is not None else f'The template\'s "{cap(lo["name"], 60)}" layout.'
        # chrome: the page number placeholder's box; a picture on the layout or master stays in the art, so the brand draws no second logo
        chrome: dict = {}
        sld = next((p for p in lo.get("placeholders", []) if p["type"] == "sldNum" and p["bbox"]), None)
        brand_chrome = (draft or {}).get("chrome") or {}
        if sld:
            chrome["pageNumber"] = to_box(plan, sld["bbox"], rule)
        elif (brand_chrome.get("page_number") or {}).get("show", True):
            chrome["pageNumber"] = False  # the template's layout has no page number, so the brand's is hidden here
            spec_notes.append("no page number placeholder in the source layout: chrome.pageNumber is false")
        # a picture on the layout or its master stays in the art, so the brand draws no second logo (the emitter drops
        # this again when the art could not keep the picture)
        master_pics = (masters.get(lo.get("master"), {}) or {}).get("pictures") if lo.get("show_master_shapes", True) else []
        if any(g.get("pictures") for g in grp) or master_pics:
            chrome["logo"] = False
            spec["logo_in_art"] = True
        brand_footer = brand_chrome.get("footer")
        if brand_footer and not any(p["type"] == "ftr" for p in lo.get("placeholders", [])):
            chrome["footer"] = False  # the template's layout has no footer, so the brand's footer is hidden here
            spec_notes.append("no footer placeholder in the source layout: chrome.footer is false")
        has_footer_ph = has_footer_ph or any(p["type"] == "dt" for p in lo.get("placeholders", []))
        if chrome:
            spec["chrome"] = chrome
        # art: one rendered SVG per master's version, keyed by the surface it was drawn on
        background: dict[str, list[dict]] = {}
        art_files: dict[str, str] = {}
        fit = "cover" if plan["native"] else "contain"
        for g in grp:
            art = g.get("art") or {}
            s_g, d_g = layout_surface(g)
            bg_differs = d_g is not None and d_g > 6 and art.get("svg_with_background")
            if bg_differs:
                background[s_g] = [{"source": art["svg_with_background"], "fit": fit}]
                art_files[s_g] = art["svg_with_background"]
            elif art.get("has_art") and art.get("svg"):
                background[s_g] = [{"source": art["svg"], "fit": fit}]
                art_files[s_g] = art["svg"]
        if background:
            spec["background"] = background
            spec["layers"] = "replace"
            if aspect_rule == "stretch" and not plan["native"]:
                spec_notes.append("stretch was asked for but the layout has art: the uniform rule applies so art and boxes stay registered")
        if len(grp) > 1:
            spec_notes.append("merged with the same layout on another master: " + ", ".join(f"{g['key']} on surface {layout_surface(g)[0]}" for g in grp))
        spec["source"] = {"file": cap(source_file or Path((extraction.get("source") or {}).get("path") or "template").name, 120) or "template", "master": lo.get("master_index", 1), "layout": cap(lo["name"], 120)}
        if placeholders_map:
            spec["source"]["placeholders"] = placeholders_map
        fixed = [t["text"] for g in grp for t in g.get("fixed_text", [])]
        if fixed and background:
            spec_notes.append("fixed text in the art (outlined glyphs in the renderer's font): " + "; ".join(sorted({cap(t, 40) for t in fixed})[:4]))
        real_regions = [r for r in regions if not (bound and bound.get("synthesized") and r is regions[-1])]
        spec["keep"] = fb_name is not None and (bool(real_regions) or title is not False or bool(background))
        if fb_name is None:
            spec_notes.append("no fallback fits: kept out until you choose one (keep: false)")
        spec["notes"] = spec_notes
        specs.append(spec)
    if has_footer_ph:
        notes.append("Date placeholders are not mapped (the schema has no date chrome). A layout with no footer placeholder hides the brand's footer (chrome.footer: false) when the draft's chrome shows one.")
    if len(specs) > MAX_LAYOUTS:
        notes.append(f"{len(specs)} layouts: a layouts.ts holds at most {MAX_LAYOUTS}. Set keep: false on the ones to drop (near-duplicates, unused ones).")
    if plan["rule"] != "native":
        notes.append(f"The source is {plan['aspect']:.3f}:1, not 16:9: the {plan['rule']} rule was applied (art-less layouts may use --aspect-rule stretch).")
    return specs, notes


# ---------------------------------------------------------------------------- checks


def is_spec(entry) -> bool:
    """A `layouts[]` entry that is a layout spec (note-style entries with `archetype` and `maps_to` are not)."""
    return isinstance(entry, dict) and "name" in entry and ("fallback" in entry or "regions" in entry or "title" in entry)


def check_specs(entries: list, catalog: dict[str, dict] | None, surface_names: set[str], base: Path | None = None) -> tuple[list[str], list[str]]:
    """Errors and warnings for the spec entries of a draft: the rules `deck brand check` applies to layouts.
    Entries with `keep: false` are not checked beyond their names. `base` is the draft's folder, for art files."""
    errors: list[str] = []
    warns: list[str] = []
    kept = [(i, e) for i, e in enumerate(entries) if is_spec(e) and e.get("keep", True)]  # i is the entry's index in the draft's layouts[]
    if len(kept) > MAX_LAYOUTS:
        errors.append(f"layouts: {len(kept)} layouts kept, at most {MAX_LAYOUTS}; set keep: false on some")
    surfaces = set(surface_names) | set(REQUIRED_SURFACES)
    names: dict[str, int] = {}
    for i, e in kept:
        where = f"layouts[{i}] ({e.get('name')!r})"
        name = e.get("name")
        if not isinstance(name, str) or not KEBAB.match(name):
            errors.append(f"{where}: the name must be kebab-case, such as \"title-photo\"")
            continue
        if name in names:
            errors.append(f"{where}: the name is also layouts[{names[name]}]'s; a slide picks a layout by name")
        names[name] = i
        if not (isinstance(e.get("description"), str) and e["description"].strip()):
            errors.append(f"{where}: description is required (a sentence on what the layout is for)")
        title = e.get("title", False)
        regions = e.get("regions") if isinstance(e.get("regions"), list) else []
        if "title" not in e:
            errors.append(f"{where}: title is required: {{ box: [x, y, w, h] }} or false")
        if title is False and not regions:
            errors.append(f"{where}: no title and no regions: a slide on it would show nothing")
        if len(regions) > MAX_REGIONS:
            errors.append(f"{where}: {len(regions)} regions; at most {MAX_REGIONS}")
        boxes = ([("title.box", title.get("box"))] if isinstance(title, dict) else []) + [(f"regions[{j}].box", r.get("box")) for j, r in enumerate(regions)]
        if isinstance((e.get("chrome") or {}).get("pageNumber"), list):
            boxes.append(("chrome.pageNumber", e["chrome"]["pageNumber"]))
        for path, box in boxes:
            if not (isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box)):
                errors.append(f"{where}.{path}: write the box as [x, y, width, height] in canvas pixels")
                continue
            x, y, w, h = box
            if w < MIN_BOX or h < MIN_BOX:
                errors.append(f"{where}.{path}: {w}x{h} is under the minimum {MIN_BOX}x{MIN_BOX}")
            elif x < 0 or y < 0 or x + w > CANVAS_W or y + h > CANVAS_H:
                errors.append(f"{where}.{path}: [{x}, {y}, {w}, {h}] leaves the {CANVAS_W}x{CANVAS_H} canvas")
        seen: dict[str, int] = {}
        for j, r in enumerate(regions):
            bind = r.get("bind") if isinstance(r.get("bind"), dict) else {}
            key = f"slot {bind['slot']}" if "slot" in bind else f"field {bind['field']}" if "field" in bind else None
            if key is None:
                errors.append(f"{where}.regions[{j}].bind: bind {{ slot: 'body' }} or {{ field: 'eyebrow' }}")
                continue
            if "slot" in bind and not SLOT.match(str(bind["slot"])) or "field" in bind and not FIELD.match(str(bind["field"])):
                errors.append(f"{where}.regions[{j}].bind: {key} is not a valid name")
            if key in seen:
                errors.append(f"{where}.regions[{j}].bind: {key} is already shown by regions[{seen[key]}]")
            seen[key] = j
            kind = r.get("kind", "text")
            if "field" in bind and kind != "text":
                errors.append(f"{where}.regions[{j}].kind: a field is frontmatter text; its region cannot be {kind!r}")
            for opt, allowed, label in (("fit", kind == "media", "a media region"), ("treatment", kind == "media", "a media region"),
                                        ("type", kind == "text", "a text region"), ("color", kind == "text", "a text region")):
                if opt in r and not allowed:
                    errors.append(f"{where}.regions[{j}].{opt}: applies only to {label}")
            if "type" in r and r["type"] not in TYPE_STEPS:
                errors.append(f"{where}.regions[{j}].type: {r['type']!r} is not a type step ({', '.join(TYPE_STEPS)})")
            if "color" in r and r["color"] not in ROLE_NAMES:
                errors.append(f"{where}.regions[{j}].color: {r['color']!r} is not a role ({', '.join(ROLE_NAMES)})")
        if isinstance(title, dict):
            if "type" in title and title["type"] not in TYPE_STEPS:
                errors.append(f"{where}.title.type: {title['type']!r} is not a type step")
            if "color" in title and title["color"] not in ROLE_NAMES:
                errors.append(f"{where}.title.color: {title['color']!r} is not a role")
        if e.get("surface") and e["surface"] not in surfaces:
            errors.append(f"{where}.surface: {e['surface']!r} is not a surface of the draft ({', '.join(sorted(surfaces))})")
        bg = e.get("background")
        if bg is not None and not isinstance(bg, dict):
            errors.append(f"{where}.background: key the art by surface: {{ \"inverse\": [{{ \"source\": \"pptx/layouts/<key>.svg\", \"fit\": \"cover\" }}] }}")
        for surf, layers in (bg or {}).items() if isinstance(bg, dict) else []:
            if surf not in surfaces:
                errors.append(f"{where}.background.{surf}: not a surface of the draft")
            for layer in layers if isinstance(layers, list) else []:
                src = layer.get("source") if isinstance(layer, dict) else None
                if not isinstance(src, str) or src.rsplit(".", 1)[-1].lower() not in ART_EXTENSIONS:
                    errors.append(f"{where}.background.{surf}: each layer needs a source file (.svg, .png, .webp, .jpg)")
                elif base is not None and not (Path(base) / src).is_file():
                    errors.append(f"{where}.background.{surf}: {src} does not exist next to the draft")
        if catalog is None:
            continue
        if name in kit_layouts(catalog):
            errors.append(f"{where}: {name!r} is already a layout of the kit or the engine; rename it, for example \"<brand>-{name}\"")
        fb = (kit_layouts(catalog)).get(e.get("fallback"))
        if fb is None:
            closest = sorted(kit_layouts(catalog), key=lambda n: _edit_distance(n, str(e.get("fallback"))))[:3]
            errors.append(f"{where}.fallback: {e.get('fallback')!r} is not a kit or engine layout; try {', '.join(closest)}")
            continue
        slot_names = set((fb.get("slots") or {})) | {"body"}
        field_names = set((fb.get("fields") or {}))
        bound_slots, bound_fields = set(), set()
        taken_fields = e.get("fields") if isinstance(e.get("fields"), list) else []
        for k, f in enumerate(taken_fields):
            if not isinstance(f, str) or not FIELD.match(f):
                errors.append(f"{where}.fields[{k}]: {f!r} is not a frontmatter field name in lowerCamelCase")
            elif f not in field_names:
                errors.append(f"{where}.fields[{k}]: the fallback {fb['name']!r} has no field {f!r}; its fields are {', '.join(sorted(field_names)) or 'none'}")
        for j, r in enumerate(regions):
            bind = r.get("bind") if isinstance(r.get("bind"), dict) else {}
            if "slot" in bind:
                bound_slots.add(bind["slot"])
                if bind["slot"] not in slot_names:
                    errors.append(f"{where}.regions[{j}].bind: the fallback {fb['name']!r} has no slot {bind['slot']!r}; its slots are {', '.join(sorted(slot_names))}")
                else:
                    accepts = set(((fb.get("slots") or {}).get(bind["slot"]) or {}).get("accepts") or [])
                    kind = r.get("kind", "text")
                    if kind == "media" and accepts and not accepts & MEDIA_KINDS:
                        warns.append(f"{where}.regions[{j}]: a media region on slot {bind['slot']!r}, which the fallback uses for {', '.join(sorted(accepts))}")
                    if kind == "text" and accepts and not accepts & TEXT_KINDS:
                        warns.append(f"{where}.regions[{j}]: a text region on slot {bind['slot']!r}, which the fallback uses for {', '.join(sorted(accepts))}")
            elif "field" in bind:
                bound_fields.add(bind["field"])
                if bind["field"] not in field_names:
                    errors.append(f"{where}.regions[{j}].bind: the fallback {fb['name']!r} has no field {bind['field']!r}; its fields are {', '.join(sorted(field_names)) or 'none'}")
                elif not is_text_field(fb, bind["field"]):
                    errors.append(f"{where}.regions[{j}].bind: the field {bind['field']!r} of {fb['name']!r} is not a string or a number, so a text region cannot draw it; list it in `fields` instead")
        for s in required_slots(fb):
            if s not in bound_slots:
                errors.append(f"{where}.regions: the fallback {fb['name']!r} requires slot {s!r}, which no region binds")
        for f in required_fields(fb):
            if f in bound_fields or f in taken_fields:
                continue
            if is_text_field(fb, f):
                errors.append(f"{where}.regions: the fallback {fb['name']!r} requires field {f!r}, which no region binds")
            else:
                errors.append(f"{where}.fields: the fallback {fb['name']!r} requires the structured field {f!r}; add it to `fields` (the layout takes it; a slide supplies it)")
        if title is False and (fb.get("title") or {}).get("required"):
            errors.append(f"{where}.title: the fallback {fb['name']!r} requires a title; give the layout one or pick another fallback")
        for slot in (e.get("budget") or {}):
            if slot not in bound_slots:
                errors.append(f"{where}.budget.{slot}: the layout budgets a slot no region binds")
    return errors, warns


def _edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


# ---------------------------------------------------------------------------- emission


def spec_to_module_value(spec: dict, art_paths: dict[str, list[dict]] | None = None) -> dict:
    """A draft spec as the value `layouts.ts` holds. Draft-only keys (key, keep, unused, notes, aspect_rule) are
    left out; `art_paths` is the background to write, as {surface: [layer dicts]}, once the files were copied."""
    out: dict = {"name": spec["name"]}
    if spec.get("label"):
        out["label"] = cap(spec["label"], 120)
    out["description"] = cap(spec.get("description") or spec["name"], 600)
    out["fallback"] = spec["fallback"]
    if spec.get("surface"):
        out["surface"] = spec["surface"]
    title = spec.get("title", False)
    out["title"] = {k: title[k] for k in ("box", "type", "align", "anchor", "color") if k in title} if isinstance(title, dict) else False
    regions = []
    for r in spec.get("regions", []):
        region = {"bind": {k: r["bind"][k] for k in r["bind"] if k in ("slot", "field")}, "box": [round(v) for v in r["box"]]}
        for k in ("kind", "type", "align", "anchor", "color", "fit", "treatment"):
            if k in r:
                region[k] = r[k]
        regions.append(region)
    out["regions"] = regions
    if isinstance(spec.get("fields"), list) and spec["fields"]:
        out["fields"] = [f for f in spec["fields"] if isinstance(f, str) and FIELD.match(f)]
    if art_paths:
        out["background"] = art_paths
        if spec.get("layers") in ("replace", "over"):
            out["layers"] = spec["layers"]
    chrome = spec.get("chrome") or {}
    if chrome:
        out["chrome"] = {k: chrome[k] for k in ("pageNumber", "footer", "progress", "logo") if k in chrome}
    if spec.get("budget"):
        out["budget"] = spec["budget"]
    src = spec.get("source")
    if isinstance(src, dict) and src.get("file"):
        out["source"] = {"file": cap(src["file"], 120) or "template"}
        for k in ("master", "layout", "placeholders"):
            if k in src:
                out["source"][k] = cap(src[k], 120) if k == "layout" else src[k]
    return out


class LayoutError(Exception):
    """A layout spec the emitter cannot write."""


def emit_layouts(draft: dict, base: Path, surfaces: set[str], notes: list[str]) -> tuple[str | None, list[tuple[str, bytes]], list[dict]]:
    """The `layouts.ts` text, the art files to copy (path relative to the brand folder, bytes) and a summary for
    import-notes.json, from the draft's layout specs. Specs with `keep: false` are not emitted. Returns
    (None, [], summary) when no spec is kept.

    Art is read only from inside the draft's folder, only when it is what its extension says, and an SVG is
    sanitised. Every name, label and description from the source is written as a capped string literal, and art
    file names come from the layout's own kebab name, never from the source."""
    entries = [e for e in draft.get("layouts") or [] if is_spec(e)]
    summary: list[dict] = [{"name": e.get("name"), "kept": bool(e.get("keep", True)), "key": e.get("key")} for e in entries if not e.get("keep", True)]
    kept = [e for e in entries if e.get("keep", True)]
    if not kept:
        return None, [], summary
    errors, _ = check_specs(draft.get("layouts") or [], None, set(surfaces))
    if errors:
        raise LayoutError("layouts: " + "; ".join(errors[:4]) + (f" (and {len(errors) - 4} more)" if len(errors) > 4 else ""))
    for i, e in enumerate(kept):
        if not isinstance(e.get("fallback"), str) or not KEBAB.match(e["fallback"]):
            raise LayoutError(f"layouts[{i}] ({e.get('name')!r}) has no fallback: choose a kit layout from `deck layouts --json`, or set keep: false")
    values: list[dict] = []
    assets: list[tuple[str, bytes]] = []
    for e in kept:
        background: dict[str, list[dict]] = {}
        files: list[str] = []
        image_lost = False
        for surface, layers in (e.get("background") or {}).items():
            out_layers = []
            for n, layer in enumerate(layers):
                where = f"layout {e['name']} art ({surface})"
                try:
                    data, ext = F.read_contained(base, layer.get("source"), ART_EXTENSIONS, MAX_ART_BYTES)
                    if ext == "svg":
                        data, removed = F.sanitize_svg(data, allow_images=True)
                        if removed:
                            notes.append(f"{where}: the SVG was sanitised; removed: {', '.join(removed)[:300]}. Look at the layout in the specimen")
                        image_lost = image_lost or "<image>" in removed
                except F.Refused as exc:
                    notes.append(f"{where}: art file not copied, layer skipped: {exc} (path in the draft: {str(layer.get('source'))[:120]!r})")
                    continue
                file = f"layouts/{e['name']}-{surface}" + (f"-{n + 1}" if n else "") + f".{ext}"
                assets.append((file, data))
                files.append(file)
                out = {"type": "image", "file": file, "fit": layer.get("fit") if layer.get("fit") in ("cover", "contain") else "cover"}
                opacity = layer.get("opacity")
                if isinstance(opacity, (int, float)) and not isinstance(opacity, bool) and 0 <= opacity <= 1:
                    out["opacity"] = opacity
                out_layers.append(out)
            if out_layers:
                background[surface] = out_layers
        value_spec = e
        if e.get("logo_in_art") and image_lost and (e.get("chrome") or {}).get("logo") is False:
            # the picture (the logo) did not survive the sanitiser, so the brand's own logo must stay
            value_spec = {**e, "chrome": {k: v for k, v in e["chrome"].items() if k != "logo"}}
            notes.append(f"layout {e['name']}: a picture in its art was removed by the sanitiser, so chrome.logo was left to the brand")
        values.append(spec_to_module_value(value_spec, background or None))
        summary.append({"name": e["name"], "kept": True, "key": e.get("key"), "keys": e.get("keys") or ([e["key"]] if e.get("key") else []), "sources": e.get("sources") or [], "label": cap(e.get("label"), 120), "fallback": e["fallback"], "surface": e.get("surface"),
                        "aspect_rule": e.get("aspect_rule"), "unused_in_source": bool(e.get("unused")), "art": files, "notes": [cap(n, 300) for n in e.get("notes") or []][:12]})
    text = T.layouts_module_text(T.normalise(values))
    if T.read_module(text, T.LAYOUTS_HEADER, list) != T.normalise(values):
        raise T.NotData("The emitted layouts.ts did not read back as the value it was written from.")
    return text, assets, summary
