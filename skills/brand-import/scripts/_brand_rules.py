"""The framework's brand rules, applied to a brand value before it is written.

`conform(brand, notes)` walks the value the emitter built against a description of the schema in
the framework's brand schema and returns one that satisfies it:

- a number out of range is clamped, with a note;
- an optional value that cannot be made valid (a colour that is not a colour, an OpenType tag that
  is not four characters, a family name with characters outside the allowed set) is dropped, with a
  note;
- a required value that cannot be made valid raises Reject, and the emitter writes nothing.

Every note is a review item. The authority is still `deck brand check`: this pass exists so the
emitter cannot write a file that breaks the rules on values that came out of an untrusted source.
references/brand-schema.md lists the rules in prose. Standard library only.
"""
from __future__ import annotations

import math
import re
import unicodedata

MAX_PIXELS = 1920
MAX_NAME_LENGTH = 64
MAX_FAMILY_NAME_LENGTH = 100
MAX_AXIS_VALUE = 1000
ROLES = ("bg", "surface", "fg", "heading", "muted", "accent", "accent-fg", "border", "positive", "negative")
TYPE_STEPS = ("display", "headline", "title", "lead", "body", "small", "caption", "label", "stat", "quote", "code")
CODE_TOKENS = ("background", "foreground", "comment", "keyword", "string", "number", "function", "type", "punctuation", "highlight", "added", "removed")
DIAGRAM_TOKENS = ("node", "node-border", "node-text", "group", "edge", "label", "highlight", "highlight-text", "packet")
NODE_KINDS = ("service", "database", "queue", "cache", "storage", "user", "client", "mobile", "cloud", "external", "function", "gateway",
              "loadbalancer", "agent", "llm", "tool", "document", "decision", "node")
MAX_DIAGRAM_CARDS = 12
CORNERS = ("top-left", "top-right", "bottom-left", "bottom-right")

_KEBAB = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
_HEX = re.compile(r"#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\Z", re.I)
_F = r"(\d{1,3}(?:\.\d{1,12})?%?|\.\d{1,12}%?)"
_N = r"(\d{1,3}(?:\.\d{1,12})?|\.\d{1,12})"
_OKLCH = re.compile(rf"oklch\(\s*{_F}\s+{_N}\s+{_N}(?:deg)?\s*(?:/\s*{_F}\s*)?\)\Z", re.I)
_ROLE_COLOR = re.compile(r"([a-z]+(?:-[a-z]+)*)(?:/(\d{1,3}))?\Z")
_PALETTE_REF = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:/\d{1,3})?\Z")
_UNICODE_RANGE_ITEM = re.compile(r"U\+(?:[0-9A-F]{1,6}(?:-[0-9A-F]{1,6})?|[0-9A-F]{0,5}\?{1,6})\Z", re.I)
_FONT_FILE = re.compile(r"(?!/)(?!.*\.\.)(?!.*//)[A-Za-z0-9_./-]+\.(?:woff2|woff|ttf|otf)\Z")
_LOGO_FILE = re.compile(r"(?!/)(?!.*\.\.)[A-Za-z0-9_./-]+\.(?:svg|png|webp)\Z")
_FONTSOURCE = re.compile(r"@fontsource(?:-variable)?/[a-z0-9-]+\Z")
_TAG = re.compile(r"[A-Za-z0-9]{1,4} {0,3}\Z")


class Reject(Exception):
    """A value the schema requires cannot be made valid."""

    def __init__(self, path: str, message: str):
        super().__init__(f"{path}: {message}")
        self.path, self.message = path, message


def _fraction(text: str) -> float:
    return float(text[:-1]) / 100 if text.endswith("%") else float(text)


def is_color_literal(value) -> bool:
    """Hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or `oklch(L C H [/ A])` with lightness and alpha at
    most 1 (or 100%), chroma at most 1 and hue at most 360."""
    if not isinstance(value, str):
        return False
    text = value.strip()
    if _HEX.match(text):
        return True
    m = _OKLCH.match(text)
    if not m:
        return False
    light, chroma, hue, alpha = m.groups()
    return _fraction(light) <= 1 and float(chroma) <= 1 and float(hue) <= 360 and (alpha is None or _fraction(alpha) <= 1)


def is_color_ref(value) -> bool:
    return is_color_literal(value) or (isinstance(value, str) and bool(_PALETTE_REF.match(value)))


def is_unicode_range(value) -> bool:
    if not isinstance(value, str):
        return False
    items = [item.strip(" \t") for item in value.split(",")]
    if not items or len(items) > 512:
        return False
    for item in items:
        if not _UNICODE_RANGE_ITEM.match(item):
            return False
        start, _, end = item[2:].replace("?", "F").partition("-")
        lo = int(start, 16)
        hi = int(end, 16) if end else lo
        if lo > hi or hi > 0x10FFFF:
            return False
    return True


def _letterlike(ch: str) -> bool:
    return unicodedata.category(ch)[0] in ("L", "M", "N")


def is_family_name(value) -> bool:
    """Letters, digits, spaces and `- _ . ' & +`, starting with a letter, digit or hyphen, at most 100 characters."""
    if not isinstance(value, str) or not value or len(value) > MAX_FAMILY_NAME_LENGTH:
        return False
    if not (_letterlike(value[0]) or value[0] == "-"):
        return False
    return all(_letterlike(ch) or ch in " -_.'&+" for ch in value[1:])


def clean_family_name(value) -> str | None:
    """A family name with the characters the framework refuses removed, or None when nothing usable is left."""
    if not isinstance(value, str):
        return None
    kept = "".join(ch for ch in value.strip().strip("\"'") if _letterlike(ch) or ch in " -_.'&+")
    kept = re.sub(r" {2,}", " ", kept).strip()[:MAX_FAMILY_NAME_LENGTH].strip()
    while kept and not (_letterlike(kept[0]) or kept[0] == "-"):
        kept = kept[1:]
    return kept if is_family_name(kept) else None


def is_opentype_tag(value) -> bool:
    return isinstance(value, str) and len(value) == 4 and bool(_TAG.match(value))


def is_fontsource_package(value) -> bool:
    return isinstance(value, str) and len(value) <= 80 and bool(_FONTSOURCE.match(value))


def is_finite(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


# --------------------------------------------------------------------------- validators
# Each takes (value, path, notes) and returns the value to write, or raises Reject.


def num(lo: float, hi: float, whole: bool = False, exclusive_lo: bool = False):
    def check(value, path, notes):
        if not is_finite(value):
            raise Reject(path, f"expected a finite number from {lo:g} to {hi:g}, got {str(value)[:40]!r}")
        out = round(value) if whole else value
        if out > hi or out < lo or (exclusive_lo and out <= lo):
            clamped = min(hi, max(lo, out))
            if exclusive_lo and clamped <= lo:
                raise Reject(path, f"expected a number above {lo:g}")
            notes.append(f"{path}: {value:g} is outside {lo:g} to {hi:g}; written as {clamped:g}")
            out = clamped
        return out
    return check


def text(nonempty: bool = False, test=None, expected: str = "a string"):
    def check(value, path, notes):
        if not isinstance(value, str) or (nonempty and not value) or (test is not None and not test(value)):
            raise Reject(path, f"expected {expected}, got {str(value)[:60]!r}")
        return value
    return check


def one_of(*options):
    def check(value, path, notes):
        if isinstance(value, bool) or value not in options:
            raise Reject(path, f"expected one of {', '.join(map(str, options))}, got {str(value)[:40]!r}")
        return value
    return check


def boolean(value, path, notes):
    if not isinstance(value, bool):
        raise Reject(path, "expected true or false")
    return value


def color(value, path, notes):
    if not is_color_ref(value):
        raise Reject(path, f"expected a colour such as #1f2937 or oklch(0.62 0.19 259) (chroma at most 1, hue at most 360) or a palette reference such as ink.900, got {str(value)[:60]!r}")
    return value.strip()


def is_card_color(value) -> bool:
    """A diagram card colour: a role with an optional opacity (`accent`, `accent/12`), which follows the slide's surface,
    or a palette reference or colour literal."""
    if not isinstance(value, str):
        return False
    m = _ROLE_COLOR.match(value)
    if m and m.group(1) in ROLES:
        return m.group(2) is None or int(m.group(2)) <= 100
    return is_color_ref(value)


def card_color(value, path, notes):
    if not is_card_color(value):
        raise Reject(path, f"expected a role such as accent or accent/12, a palette reference such as ink.900/20 or a colour such as #1f2937, got {str(value)[:60]!r}")
    return value.strip()


def card_paint(value, path, notes):
    return value if value == "none" else card_color(value, path, notes)


def color_literal(value, path, notes):
    if not is_color_literal(value):
        raise Reject(path, f"expected a hex or oklch() colour, got {str(value)[:60]!r}")
    return value.strip()


def kebab(value, path, notes):
    if not isinstance(value, str) or len(value) > MAX_NAME_LENGTH or not _KEBAB.match(value):
        raise Reject(path, f"expected a kebab-case name of at most {MAX_NAME_LENGTH} characters, got {str(value)[:40]!r}")
    return value


def family(value, path, notes):
    if is_family_name(value):
        return value
    cleaned = clean_family_name(value)
    if cleaned is None:
        raise Reject(path, "expected a family name of letters, digits, spaces and - _ . ' & +")
    notes.append(f"{path}: the family name had characters the framework refuses (only letters, digits, spaces and - _ . ' & + are allowed); written as {cleaned!r}")
    return cleaned


def struct(required: dict, optional: dict | None = None):
    optional = optional or {}

    def check(value, path, notes):
        if not isinstance(value, dict):
            raise Reject(path, "expected an object")
        out = {}
        for key, item in value.items():
            where = f"{path}.{key}" if path else str(key)
            if key in required:
                out[key] = required[key](item, where, notes)
            elif key in optional:
                try:
                    out[key] = optional[key](item, where, notes)
                except Reject as exc:
                    notes.append(f"{exc.path}: {exc.message}; left out")
            else:
                notes.append(f"{where[:120]}: not a field of the brand schema; left out")
        missing = [key for key in required if key not in out]
        if missing:
            raise Reject(f"{path}.{missing[0]}" if path else missing[0], "required and missing")
        return out
    return check


def array(item, min_len: int = 0, max_len: int | None = None, odd: bool = False):
    def check(value, path, notes):
        if not isinstance(value, (list, tuple)):
            raise Reject(path, "expected a list")
        out = []
        for index, entry in enumerate(value):
            try:
                out.append(item(entry, f"{path}[{index}]", notes))
            except Reject as exc:
                notes.append(f"{exc.path}: {exc.message}; left out")
        if max_len is not None and len(out) > max_len:
            notes.append(f"{path}: {len(out)} entries, the framework takes at most {max_len}; the rest were left out")
            out = out[:max_len]
        if len(out) < min_len:
            raise Reject(path, f"expected at least {min_len} valid entries, has {len(out)}")
        if odd and len(out) % 2 == 0:
            raise Reject(path, f"has {len(out)} colours; a diverging palette needs an odd number, with the midpoint in the middle")
        return out
    return check


def record(key_ok, item, what: str = "name"):
    def check(value, path, notes):
        if not isinstance(value, dict):
            raise Reject(path, "expected an object")
        out = {}
        for key, entry in value.items():
            if not isinstance(key, str) or not key_ok(key) or key == "__proto__":
                notes.append(f"{path}: {str(key)[:40]!r} is not a valid {what}; left out")
                continue
            try:
                out[key] = item(entry, f"{path}.{key}", notes)
            except Reject as exc:
                notes.append(f"{exc.path}: {exc.message}; left out")
        return out
    return check


def either(*choices):
    def check(value, path, notes):
        first = None
        for choice in choices:
            trial: list[str] = []
            try:
                out = choice(value, path, trial)
            except Reject as exc:
                first = first or exc
                continue
            notes.extend(trial)
            return out
        raise first
    return check


def fixed_list(*items):
    def check(value, path, notes):
        if not isinstance(value, (list, tuple)) or len(value) != len(items):
            raise Reject(path, f"expected a list of {len(items)} values")
        return [item(entry, f"{path}[{index}]", notes) for index, (item, entry) in enumerate(zip(items, value))]
    return check


def _kebab_key(key: str) -> bool:
    return len(key) <= MAX_NAME_LENGTH and bool(_KEBAB.match(key))


# --------------------------------------------------------------------------- the schema

PX = num(0, MAX_PIXELS)
OFFSET = num(-MAX_PIXELS, MAX_PIXELS)
PERCENT = num(0, 100)
WEIGHT = num(1, 1000)
ROLE = one_of(*ROLES)
STEP = one_of(*TYPE_STEPS)
STROKE = one_of("hairline", "regular", "bold")
CORNER = one_of(*CORNERS)
STYLE = one_of("normal", "italic")

SHADOW_LAYER = struct({"y": OFFSET, "blur": PX, "color": color}, {"x": OFFSET, "spread": OFFSET, "inset": boolean})
SHADOW = either(one_of("none"), array(SHADOW_LAYER, min_len=1))
CODE = struct({}, {token: color for token in CODE_TOKENS})
SURFACE_CARD = struct({}, {
    "fill": card_paint, "border": card_paint, "text": card_color, "subtext": card_color,
    "icon": struct({}, {"color": card_color, "fill": card_color}), "accent": struct({}, {"color": card_color}),
})
DIAGRAM = struct({}, {**{token: color for token in DIAGRAM_TOKENS}, "cards": record(_kebab_key, SURFACE_CARD, "card name")})
RADIUS_NAME = one_of("none", "sm", "md", "lg", "xl")
CARD = struct({}, {
    "fill": card_paint, "border": card_paint, "stroke": STROKE, "radius": RADIUS_NAME, "shadow": one_of("none", "sm", "md", "lg"),
    "shape": one_of("kind", "box", "pill"), "text": card_color, "subtext": card_color,
    "icon": struct({}, {"style": one_of("chip", "solid", "plain", "none"), "color": card_color, "fill": card_color}),
    "accent": struct({}, {"side": one_of("left", "top", "right", "bottom"), "color": card_color, "width": STROKE}),
    "title": struct({}, {"family": one_of("display", "body", "mono"), "weight": WEIGHT, "tracking": num(-0.1, 0.5), "case": one_of("none", "upper")}),
})


def cards(value, path, notes):
    out = record(_kebab_key, CARD, "card name")(value, path, notes)
    if len(out) > MAX_DIAGRAM_CARDS:
        notes.append(f"{path}: {len(out)} cards, the framework takes at most {MAX_DIAGRAM_CARDS}; the rest were left out")
        out = dict(list(out.items())[:MAX_DIAGRAM_CARDS])
    return out


BRAND_DIAGRAM = struct({}, {
    **{token: color for token in DIAGRAM_TOKENS},
    "edges": struct({}, {"stroke": STROKE, "corners": one_of("round", "sharp"), "arrow": one_of("triangle", "open", "dot")}),
    "groups": struct({}, {"stroke": one_of("none", "hairline", "regular", "bold"), "dashed": boolean, "radius": RADIUS_NAME}),
    "labels": struct({}, {"style": one_of("plain", "chip"), "type": one_of("caption", "label")}),
    "kinds": record(lambda k: k in NODE_KINDS, kebab, "node kind"),
    "cards": cards,
})
CATEGORICAL = array(color, min_len=3, max_len=12)
RAMP = array(color, min_len=3)
DIVERGING = array(color, min_len=3, odd=True)
SURFACE = struct({}, {
    **{role: color for role in ROLES}, "gradient": kebab, "logo": kebab,
    "data": struct({}, {"plate": color, "categorical": CATEGORICAL, "sequential": RAMP, "diverging": DIVERGING, "context": color}),
    "code": CODE, "diagram": DIAGRAM, "shadow": struct({}, {"sm": SHADOW, "md": SHADOW, "lg": SHADOW}),
})
STOPS = array(either(color, struct({"color": color, "at": PERCENT})), min_len=2)
GRAIN = num(0, 0.4)
GRADIENT = either(
    struct({"type": one_of("linear"), "angle": num(-360, 360), "stops": STOPS}, {"grain": GRAIN}),
    struct({"type": one_of("radial"), "stops": STOPS}, {"shape": one_of("circle", "ellipse"), "at": struct({"x": PERCENT, "y": PERCENT}), "grain": GRAIN}),
    struct({"type": one_of("mesh"), "base": color, "points": array(struct({"color": color, "x": PERCENT, "y": PERCENT}, {"size": PERCENT}), min_len=1)}, {"grain": GRAIN}),
)
FONT_BYTE = num(0, 255, whole=True)
SUBSTITUTE = struct({"family": family}, {"panose": text(test=lambda v: bool(re.fullmatch(r"[0-9A-Fa-f]{20}", v)), expected="20 hex digits"), "pitchFamily": FONT_BYTE, "charset": FONT_BYTE})
FONT_SOURCE = either(
    struct({"kind": one_of("fontsource"), "package": text(test=is_fontsource_package, expected="a Fontsource package such as @fontsource-variable/inter")},
           {"axes": text(test=lambda v: bool(re.fullmatch(r"[a-z0-9]+", v)), expected="a Fontsource file set such as wght"), "weights": array(WEIGHT), "styles": array(STYLE),
            "subsets": array(text(test=lambda v: bool(_KEBAB.match(v)), expected="a subset such as latin"))}),
    struct({"kind": one_of("files"), "files": array(struct(
        {"path": text(test=lambda v: bool(_FONT_FILE.match(v)), expected="a relative path inside the brand folder ending in .woff2, .woff, .ttf or .otf"),
         "weight": either(WEIGHT, fixed_list(WEIGHT, WEIGHT))},
        {"style": STYLE, "unicodeRange": text(test=is_unicode_range, expected="a CSS unicode-range such as U+0000-00FF, U+0131")}), min_len=1)}),
    struct({"kind": one_of("system")}),
    struct({"kind": one_of("unavailable"), "reason": text(nonempty=True)}),
)
FAMILY = struct({"family": family, "fallback": array(family), "source": FONT_SOURCE}, {"substitute": SUBSTITUTE})
TYPE_STEP = struct(
    {"family": one_of("display", "body", "mono"), "size": num(20, MAX_PIXELS), "lineHeight": num(0.7, 2.5), "tracking": num(-0.1, 0.5), "weight": WEIGHT},
    {"case": one_of("none", "upper"), "style": STYLE, "features": array(text(test=is_opentype_tag, expected="a four-character OpenType tag such as tnum")),
     "axes": record(is_opentype_tag, num(-MAX_AXIS_VALUE, MAX_AXIS_VALUE), "four-character OpenType axis tag")},
)
TREATMENT = either(
    struct({"type": one_of("none")}), struct({"type": one_of("rounded"), "radius": one_of("sm", "md", "lg", "xl")}), struct({"type": one_of("grayscale")}),
    struct({"type": one_of("duotone"), "shadow": color, "highlight": color}), struct({"type": one_of("tint"), "color": color, "opacity": num(0, 1)}),
)
CHART_LINE = {"show": boolean, "color": ROLE, "stroke": STROKE, "dash": one_of("solid", "dashed", "dotted")}
CHARTS = struct({}, {
    "grid": struct({}, CHART_LINE), "axis": struct({}, {**CHART_LINE, "ticks": boolean}),
    "labels": struct({}, {"axis": STEP, "value": STEP, "legend": STEP, "annotation": STEP, "color": ROLE}),
    "numbers": struct({}, {"locale": text(test=lambda v: bool(re.fullmatch(r"[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}", v)), expected="a locale such as en-US"),
                           "notation": one_of("standard", "compact"), "currency": text(test=lambda v: bool(re.fullmatch(r"[A-Z]{3}", v)), expected="a currency code such as EUR"),
                           "maximumFractionDigits": num(0, 4, whole=True), "signDisplay": one_of("auto", "always", "exceptZero")}),
    "stat": struct({}, {"step": STEP, "label": STEP, "color": ROLE}),
    "table": struct({}, {"header": STEP, "body": STEP, "emphasis": one_of("fill", "text", "bar"), "rule": STROKE, "zebra": boolean}),
})
BRAND = struct({
    "name": kebab,
    "label": text(nonempty=True),
    "color": struct({
        "palette": record(_kebab_key, record(lambda k: bool(re.fullmatch(r"[a-z0-9]+", k)), color_literal, "palette step"), "palette name"),
        "roles": struct({role: color for role in ROLES if role != "heading"}, {"heading": color}),
        "surfaces": record(_kebab_key, SURFACE, "surface name"),
        "data": struct({"categorical": CATEGORICAL, "sequential": RAMP, "diverging": DIVERGING, "context": color}),
    }, {"waivers": array(struct({"color": ROLE, "on": ROLE, "reason": text(nonempty=True)}, {"surface": kebab}))}),
    "gradients": record(_kebab_key, GRADIENT, "gradient name"),
    "typography": struct({"families": struct({"display": FAMILY, "body": FAMILY, "mono": FAMILY}), "scale": struct({step: TYPE_STEP for step in TYPE_STEPS})}),
    "shape": struct({"radius": struct({k: PX for k in ("sm", "md", "lg", "xl")}), "stroke": struct({k: PX for k in ("hairline", "regular", "bold")}),
                     "shadow": struct({"sm": SHADOW, "md": SHADOW, "lg": SHADOW})}),
    "spacing": struct({"scale": struct({k: PX for k in ("2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl")}), "margin": struct({"x": PX, "y": PX}),
                       "grid": struct({"columns": num(1, 24, whole=True), "gutter": PX})}),
    "logo": struct({"variants": record(_kebab_key, struct({"file": text(test=lambda v: bool(_LOGO_FILE.match(v)), expected="a relative .svg, .png or .webp path inside the brand folder"),
                                                           "aspect": num(0, 50, exclusive_lo=True)}), "logo variant"),
                    "default": kebab, "clearSpace": num(0, 10), "placement": struct({"corner": CORNER, "height": PX})}),
    "icons": struct({"set": kebab, "strokeWidth": num(0.5, 4)}),
    "imagery": struct({"treatments": record(_kebab_key, TREATMENT, "treatment name"), "default": kebab}),
    "chrome": struct({
        "pageNumber": struct({"show": boolean, "format": text(test=lambda v: "{n}" in v, expected="a format containing {n}"), "corner": CORNER}),
        "footer": struct({"show": boolean, "text": text(), "corner": CORNER}),
        "progress": struct({"show": boolean, "edge": one_of("top", "bottom"), "thickness": PX}),
        "logo": struct({"show": boolean}), "skipFirst": boolean,
    }),
    "motion": struct({"easings": record(_kebab_key, fixed_list(num(0, 1), num(-5, 5), num(0, 1), num(-5, 5)), "easing name"),
                      "durations": record(_kebab_key, num(0, 3000), "duration name"),
                      "transition": struct({"kind": one_of("none", "fade", "slide", "rise", "push", "cover", "wipe", "zoom"), "duration": kebab, "easing": kebab})}),
}, {"code": CODE, "diagram": BRAND_DIAGRAM, "charts": CHARTS})


def conform(brand: dict, notes: list[str]) -> dict:
    """The brand value with every field inside the framework's rules. Raises Reject when a required field cannot be."""
    return BRAND(brand, "", notes)
