"""Write and re-read a `brand.ts` that is data and nothing else.

Values in a brand draft come from untrusted sources (a deck's text, a page's markup), and Node imports
the emitted `brand.ts`. So the file is built from three things only: a header of fixed text, one
literal produced by `ts()` (the single serialiser every value goes through), and a fixed tail. No
source-derived string is ever written into a comment or outside a string literal.

`read_module()` is the check on that: a strict reader that accepts exactly this shape and returns the
value. The emitter reads back what it is about to write and refuses when the result is not the value
it meant to write. It never runs the file.

Standard library only.
"""
from __future__ import annotations

import math
import re

HEADER = (
    "import { defineBrand } from '@deckster/brand';\n"
    "\n"
    "/**\n"
    " * Imported with the brand-import skill. Where each value came from, the open review items and the\n"
    " * font notes are in import-notes.json next to this file. Regenerate it with the skill's\n"
    " * emit_brand.py while the import is open, instead of editing it by hand.\n"
    " */\n"
    "export default defineBrand("
)
TAIL = ");\n"
LAYOUTS_HEADER = (
    "import { defineBrandLayouts } from '@deckster/brand';\n"
    "\n"
    "/**\n"
    " * Imported with the brand-import skill from the source template's slide layouts. The art files are in\n"
    " * layouts/; the choices behind each layout are in import-notes.json. Regenerate it with the skill's\n"
    " * emit_brand.py while the import is open, instead of editing it by hand.\n"
    " */\n"
    "export default defineBrandLayouts("
)

_BARE_KEY = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*\Z")
_NUMBER_KEY = re.compile(r"(?:0|[1-9][0-9]*)\Z")
_SHORT = {"\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t"}


class NotData(ValueError):
    """The text is not the fixed header, one data literal and the fixed tail."""


def js_string(value: str) -> str:
    """A JavaScript string literal for any Python string.

    Backslash, the quote, every control character, U+2028 and U+2029 (line terminators in older
    engines and in many tools), lone surrogates and the `/` of `</` (so the text can sit inside a
    `<script>` element) are escaped. Everything else is written as it is. The quote is the one that
    needs fewer escapes, single on a tie, which is what a formatter picks.
    """
    if not isinstance(value, str):
        raise TypeError("js_string takes a string")
    quote = '"' if value.count("'") > value.count('"') else "'"
    out = [quote]
    previous = ""
    for ch in value:
        code = ord(ch)
        if ch == quote:
            out.append("\\" + ch)
        elif ch in _SHORT:
            out.append(_SHORT[ch])
        elif code < 0x20 or code == 0x7F or code in (0x2028, 0x2029) or 0xD800 <= code <= 0xDFFF or code in (0xFEFF, 0xFFFE, 0xFFFF):
            out.append("\\u%04x" % code)
        elif ch == "/" and previous == "<":
            out.append("\\/")
        else:
            out.append(ch)
        previous = ch
    out.append(quote)
    return "".join(out)


def _number(value) -> str:
    if not math.isfinite(value):
        raise ValueError("a brand has no NaN or infinite numbers")
    if isinstance(value, int):
        return str(value)
    rounded = round(float(value), 4)
    if rounded.is_integer():
        return str(int(rounded))
    text = repr(rounded)
    if not re.fullmatch(r"-?[0-9]+\.[0-9]+", text):
        raise ValueError(f"{value!r} cannot be written as a plain decimal")
    return text


def _key(name) -> str:
    if not isinstance(name, str):
        raise TypeError("object keys are strings")
    if name == "__proto__":
        raise ValueError("__proto__ is not a data key")
    return name if _BARE_KEY.match(name) or _NUMBER_KEY.match(name) else js_string(name)


WIDTH = 100


def _flat(value) -> str:
    """The value on one line."""
    if isinstance(value, str):
        return js_string(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return _number(value)
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(_flat(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{ " + ", ".join(f"{_key(k)}: {_flat(v)}" for k, v in value.items()) + " }" if value else "{}"
    raise TypeError(f"{type(value).__name__} is not data")


def ts(value, indent: int = 0, used: int = 0) -> str:
    """Serialise plain data (dict, list, str, bool, finite number) as a TypeScript literal laid out the way
    a formatter lays it out, so formatting it changes nothing: one line when it fits in 100
    columns, otherwise one entry per line; a string too long for its line moves under its key.

    `used` is the number of columns already taken on the value's first line; one more follows it (a comma).
    """
    pad, inner = "  " * indent, "  " * (indent + 1)
    if not isinstance(value, (list, tuple, dict)):
        return _flat(value)
    flat = _flat(value)
    fits = used + len(flat) + 1 <= WIDTH
    if isinstance(value, (list, tuple)):
        # The formatter always breaks a list of several objects (or several lists) that each hold more than one entry.
        several = len(value) > 1 and (all(isinstance(v, dict) and len(v) > 1 for v in value) or all(isinstance(v, (list, tuple)) and len(v) > 1 for v in value))
        if not value or (fits and not several):
            return flat
        return "[\n" + "".join(f"{inner}{ts(v, indent + 1, len(inner))},\n" for v in value) + pad + "]"
    # An object written over several lines stays that way under the formatter, so larger ones are opened up for reading.
    if not value or (fits and all(not isinstance(v, dict) or len(v) <= 3 for v in value.values())):
        return flat
    lines = []
    for k, v in value.items():
        lead = f"{inner}{_key(k)}: "
        if isinstance(v, str) and len(lead) + len(js_string(v)) + 1 > WIDTH:
            lines.append(f"{inner}{_key(k)}:\n{inner}  {js_string(v)},\n")
        else:
            lines.append(f"{lead}{ts(v, indent + 1, len(lead))},\n")
    return "{\n" + "".join(lines) + pad + "}"


def normalise(value):
    """The value as `ts()` writes it: numbers rounded to four places, whole floats as ints, tuples as lists."""
    if isinstance(value, bool) or isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return float(_number(value)) if "." in _number(value) else int(_number(value))
    if isinstance(value, (list, tuple)):
        return [normalise(v) for v in value]
    if isinstance(value, dict):
        return {k: normalise(v) for k, v in value.items()}
    raise TypeError(f"{type(value).__name__} is not data")


def module_text(value) -> str:
    """The whole `brand.ts` for a brand value."""
    return HEADER + ts(value) + TAIL


def layouts_module_text(value: list) -> str:
    """The whole `layouts.ts` for a list of layout specs."""
    return LAYOUTS_HEADER + ts(value) + TAIL


class _Reader:
    """A reader for the literal `ts()` writes: objects, arrays, strings, numbers, true and false. No
    comments, no identifiers as values, no calls, no templates, no spreads, no computed keys."""

    _ESCAPES = {"\\": "\\", "'": "'", '"': '"', "n": "\n", "r": "\r", "t": "\t", "/": "/"}
    _NUM = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?")
    _WORD = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")

    def __init__(self, text: str):
        self.text, self.pos, self.depth = text, 0, 0

    def fail(self, what: str):
        raise NotData(f"{what} at offset {self.pos}")

    def space(self) -> None:
        while self.pos < len(self.text) and self.text[self.pos] in " \n":
            self.pos += 1

    def value(self):
        self.space()
        ch = self.text[self.pos:self.pos + 1]
        if ch == "{":
            return self.nested(self.obj)
        if ch == "[":
            return self.nested(self.arr)
        if ch in ("'", '"'):
            return self.string()
        if self.text.startswith("true", self.pos) and not self._WORD.match(self.text, self.pos + 4):
            self.pos += 4
            return True
        if self.text.startswith("false", self.pos) and not self._WORD.match(self.text, self.pos + 5):
            self.pos += 5
            return False
        m = self._NUM.match(self.text, self.pos)
        if m:
            self.pos = m.end()
            if self._WORD.match(self.text, self.pos) or self.text[self.pos:self.pos + 1] == ".":
                self.fail("a number followed by more")
            return float(m.group()) if "." in m.group() else int(m.group())
        self.fail("something that is not data")

    def nested(self, read):
        self.depth += 1
        if self.depth > 40:
            self.fail("nesting too deep")
        result = read()
        self.depth -= 1
        return result

    def string(self) -> str:
        quote = self.text[self.pos]
        self.pos += 1
        out = []
        while True:
            if self.pos >= len(self.text):
                self.fail("an unclosed string")
            ch = self.text[self.pos]
            code = ord(ch)
            if ch == quote:
                self.pos += 1
                return "".join(out)
            if code < 0x20 or code in (0x7F, 0x2028, 0x2029) or 0xD800 <= code <= 0xDFFF:
                self.fail("a raw control character or line break in a string")
            if ch == "\\":
                nxt = self.text[self.pos + 1:self.pos + 2]
                if nxt == "u":
                    hexd = self.text[self.pos + 2:self.pos + 6]
                    if not re.fullmatch(r"[0-9a-f]{4}", hexd):
                        self.fail("a bad \\u escape")
                    out.append(chr(int(hexd, 16)))
                    self.pos += 6
                elif nxt in self._ESCAPES:
                    out.append(self._ESCAPES[nxt])
                    self.pos += 2
                else:
                    self.fail("an escape the emitter does not write")
            else:
                out.append(ch)
                self.pos += 1

    def key(self) -> str:
        ch = self.text[self.pos:self.pos + 1]
        if ch in ("'", '"'):
            return self.string()
        m = self._WORD.match(self.text, self.pos) or re.compile(r"0|[1-9][0-9]*").match(self.text, self.pos)
        if not m:
            self.fail("an object key that is not a plain name")
        self.pos = m.end()
        return m.group()

    def obj(self) -> dict:
        self.pos += 1
        out: dict = {}
        while True:
            self.space()
            if self.text[self.pos:self.pos + 1] == "}":
                self.pos += 1
                return out
            name = self.key()
            if name == "__proto__" or name in out:
                self.fail("a repeated or reserved key")
            self.space()
            if self.text[self.pos:self.pos + 1] != ":":
                self.fail("a key without a value")
            self.pos += 1
            out[name] = self.value()
            self.space()
            if self.text[self.pos:self.pos + 1] == ",":
                self.pos += 1
            elif self.text[self.pos:self.pos + 1] != "}":
                self.fail("something between two properties")

    def arr(self) -> list:
        self.pos += 1
        out = []
        while True:
            self.space()
            if self.text[self.pos:self.pos + 1] == "]":
                self.pos += 1
                return out
            out.append(self.value())
            self.space()
            if self.text[self.pos:self.pos + 1] == ",":
                self.pos += 1
            elif self.text[self.pos:self.pos + 1] != "]":
                self.fail("something between two elements")


def read_module(text: str, header: str = HEADER, kind: type = dict):
    """The value of a `brand.ts` written by `module_text()` (or, with LAYOUTS_HEADER and `kind=list`, a
    `layouts.ts` written by `layouts_module_text()`), read without running it.

    Raises NotData for anything else: another import, a statement, a comment that is not the fixed
    header, a call, a template string, an identifier used as a value.
    """
    if not text.startswith(header):
        raise NotData("the file does not start with the fixed import and comment")
    reader = _Reader(text)
    reader.pos = len(header)
    value = reader.value()
    if not isinstance(value, kind):
        raise NotData("the default export is not " + ("an object literal" if kind is dict else "an array literal"))
    if text[reader.pos:] != TAIL:
        raise NotData(f"something follows the literal at offset {reader.pos}")
    return value
