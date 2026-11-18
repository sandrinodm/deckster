"""File handling for untrusted sources: content sniffing, contained reads, SVG sanitising, zip limits.

A source deck, PDF or web page is data from someone else. These helpers keep it from naming files
outside the import folder, from passing one kind of file off as another, from carrying script in
an SVG, and from exhausting memory or disk with a crafted archive.

Standard library only.
"""
from __future__ import annotations

import io
import os
import re
import stat
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

FONT_EXTENSIONS = ("woff2", "woff", "ttf", "otf")
LOGO_EXTENSIONS = ("svg", "png", "webp")
MAX_FONT_BYTES = 30 * 1024 * 1024
MAX_LOGO_BYTES = 10 * 1024 * 1024
MAX_SVG_BYTES = 2 * 1024 * 1024
MAX_SVG_ELEMENTS = 20000
MAX_LAYOUT_ART_SVG_BYTES = 8 * 1024 * 1024  # layout art may carry embedded pictures
MAX_SVG_DEPTH = 64
MAX_XML_PART_BYTES = 64 * 1024 * 1024
MAX_MEDIA_FILES = 600
MAX_MEDIA_BYTES = 100 * 1024 * 1024
MAX_PDF_BYTES = 1024 * 1024 * 1024
MAX_RENDER_PAGES = 200
MAX_PIXELS = 40_000_000
MEDIA_EXTENSIONS = ("png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff", "webp", "svg", "emf", "wmf", "jxr", "wdp")

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
XML_NS = "http://www.w3.org/XML/1998/namespace"


class Refused(ValueError):
    """A file or archive was not used; the message says why."""


# --------------------------------------------------------------------------- content sniffing

_SVG_HEAD = re.compile(r"^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--.*?-->\s*|<!DOCTYPE[^>\[]*>\s*)*<svg[\s>/]", re.I | re.S)


def looks_like_svg(head: bytes) -> bool:
    if b"\x00" in head[:64]:
        return False
    return bool(_SVG_HEAD.match(head[:2048].decode("utf-8", "ignore").lstrip("﻿")))


def sniff(data: bytes) -> str | None:
    """The kind of file the first bytes say it is, as an extension, or None when it is none we handle."""
    if data[:4] == b"wOF2":
        return "woff2"
    if data[:4] == b"wOFF":
        return "woff"
    if data[:4] in (b"\x00\x01\x00\x00", b"true"):
        return "ttf"
    if data[:4] == b"OTTO":
        return "otf"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"\x00\x00\x01\x00":
        return "ico"
    if looks_like_svg(data):
        return "svg"
    return None


# --------------------------------------------------------------------------- contained reads


def read_contained(base: Path, written, extensions: tuple, max_bytes: int) -> tuple[bytes, str]:
    """The bytes and kind of a file a draft names, when it is safe to copy into a brand.

    The path is relative to `base` (the import work folder). After every symlink is followed it
    must still be inside that folder, be a regular file no larger than `max_bytes`, have one of the
    allowed extensions, and start with the bytes that extension promises. Anything else raises
    Refused, so a draft cannot make the emitter copy `/etc/hosts` or a key into a brand.
    """
    if not isinstance(written, str) or not written or "\x00" in written:
        raise Refused("the path is not a plain string")
    if os.path.isabs(written) or re.match(r"^[A-Za-z]:[\\/]", written) or written.startswith(("\\", "~")):
        raise Refused("the path is absolute; copy the file into the import work folder and name it relative to the draft")
    root = os.path.realpath(base)
    real = os.path.realpath(os.path.join(root, written))
    if os.path.commonpath([root, real]) != root or real == root:
        raise Refused("the path leaves the import work folder once symlinks are followed")
    ext = os.path.splitext(real)[1].lstrip(".").lower()
    if ext not in extensions:
        raise Refused(f"not a {', '.join('.' + e for e in extensions)} file")
    try:
        fd = os.open(real, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError as exc:
        raise Refused(f"cannot be opened ({exc.strerror or exc})") from None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise Refused("not a regular file")
        if info.st_size > max_bytes:
            raise Refused(f"larger than {max_bytes // (1024 * 1024)} MB")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            data = handle.read(max_bytes + 1)
    finally:
        os.close(fd)
    if len(data) > max_bytes:
        raise Refused(f"larger than {max_bytes // (1024 * 1024)} MB")
    kind = sniff(data)
    if kind != ext:
        raise Refused(f"its content is not what .{ext} says (it reads as {kind or 'something else'})")
    return data, ext


# --------------------------------------------------------------------------- XML


def decode_xml(raw: bytes, what: str = "XML") -> str:
    """XML bytes as text, with the declaration removed, when they are UTF-8 and declare no DTD.

    Scanning bytes for `<!DOCTYPE` misses a UTF-16 document, so the encoding is settled first:
    anything that is not UTF-8 is refused. Then a DTD or entity declaration is refused, which closes
    entity expansion and external entities without needing a third-party parser.
    """
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff") or raw[:4] in (b"\x00\x00\xfe\xff", b"\xff\xfe\x00\x00") or b"\x00" in raw[:256]:
        raise Refused(f"{what}: not UTF-8 (UTF-16 and UTF-32 parts are refused)")
    try:
        text = raw.decode("utf-8-sig", "strict")
    except UnicodeDecodeError:
        raise Refused(f"{what}: not valid UTF-8") from None
    decl = re.match(r"\s*<\?xml([^>]*)\?>", text)
    if decl:
        enc = re.search(r"encoding\s*=\s*[\"']([^\"']*)[\"']", decl.group(1))
        if enc and enc.group(1).strip().lower() not in ("utf-8", "utf8"):
            raise Refused(f"{what}: declares the encoding {enc.group(1)[:20]!r}, only UTF-8 is read")
        text = text[decl.end():]
    if "<!DOCTYPE" in text or "<!ENTITY" in text:
        raise Refused(f"{what}: DTD or entity declaration; refusing to parse")
    return text


def parse_xml(raw: bytes, what: str = "XML") -> ET.Element:
    """Parse untrusted XML: UTF-8 only, no DTD, no entity declarations."""
    try:
        return ET.fromstring(decode_xml(raw, what))
    except ET.ParseError as exc:
        raise Refused(f"{what}: not well-formed XML ({exc})") from None


# --------------------------------------------------------------------------- SVG

_SVG_ELEMENTS = {
    "svg", "g", "defs", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "linearGradient",
    "radialGradient", "stop", "clipPath", "mask", "symbol", "use", "text", "tspan", "pattern", "style",
}
_SVG_ATTRIBUTES = {
    "id", "class", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "viewBox", "preserveAspectRatio",
    "points", "transform", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
    "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "clip-path", "clip-rule", "mask", "offset",
    "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod", "fx", "fy", "fr", "patternUnits",
    "patternTransform", "patternContentUnits", "clipPathUnits", "maskUnits", "maskContentUnits", "font-family", "font-size",
    "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "dx", "dy", "color", "display", "visibility",
    "vector-effect", "paint-order", "style", "role", "aria-label", "aria-hidden", "focusable", "version", "mix-blend-mode",
}
_HREF_ELEMENTS = {"use", "linearGradient", "radialGradient", "pattern"}
_LOCAL_REF = re.compile(r"#[A-Za-z_][\w.:-]*\Z")
_LOCAL_URL = re.compile(r"url\(\s*(['\"]?)#[A-Za-z_][\w.:-]*\1\s*\)", re.I)
# CSS functions other than url() that take a quoted URL and fetch it (image-set("https://...")),
# so a stylesheet could still load remote content or track whoever opens the logo.
_FETCHING_FUNCTIONS = r"(?:-webkit-)?image-set\s*\(|\bsrc\s*\(|cross-fade\s*\(|\belement\s*\(|\bimage\s*\("
_BAD_VALUE = re.compile(r"javascript\s*:|vbscript\s*:|data\s*:|expression\s*\(|@import|@font-face|@namespace|-moz-binding|behavior\s*:|[\\<\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|/\*|" + _FETCHING_FUNCTIONS, re.I)


def _value_ok(value: str) -> bool:
    """A presentation attribute or stylesheet with no way out of the file: no script, no escapes, and
    `url()` only to an element of the same file."""
    if _BAD_VALUE.search(value):
        return False
    return "url(" not in _LOCAL_URL.sub("", value).lower().replace(" ", "")


# Layout art (a template layout rendered to SVG) may carry pictures: pdftocairo writes a raster as <image href="data:image/png...">.
_IMAGE_ATTRIBUTES = {"x", "y", "width", "height", "transform", "preserveAspectRatio", "opacity", "clip-path", "mask", "id", "image-rendering"}
_DATA_IMAGE = re.compile(r"data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)\Z")
MAX_ART_IMAGE_BYTES = 4 * 1024 * 1024
MAX_ART_IMAGE_PIXELS = 24_000_000


def _clean_data_image(value: str) -> str | None:
    """A `data:image/png|jpeg;base64` URI re-encoded as a clean data URI, or None. The bytes must be the format they
    claim. With Pillow installed the picture is decoded and written again (metadata and trailing data are dropped,
    the pixel count is capped); without it the bytes are kept only when the header and size check out."""
    import base64  # noqa: PLC0415
    import binascii  # noqa: PLC0415

    m = _DATA_IMAGE.match(value.strip())
    if not m or len(value) > MAX_ART_IMAGE_BYTES * 4 // 3 + 64:
        return None
    try:
        data = base64.b64decode(re.sub(r"\s+", "", m.group(2)), validate=True)
    except (binascii.Error, ValueError):
        return None
    kind = sniff(data)
    if kind not in ("png", "jpg", "jpeg") or len(data) > MAX_ART_IMAGE_BYTES:
        return None
    try:
        from PIL import Image  # noqa: PLC0415

        with Image.open(io.BytesIO(data)) as im:
            if im.width * im.height > MAX_ART_IMAGE_PIXELS:
                return None
            fmt = "PNG" if kind == "png" else "JPEG"
            out = io.BytesIO()
            im.convert("RGBA" if fmt == "PNG" else "RGB").save(out, fmt)
            data, kind = out.getvalue(), "png" if fmt == "PNG" else "jpeg"
    except ImportError:
        kind = "png" if kind == "png" else "jpeg"
    except Exception:  # noqa: BLE001
        return None
    return f"data:image/{kind};base64," + base64.b64encode(data).decode("ascii")


def sanitize_svg(raw: bytes, allow_images: bool = False) -> tuple[bytes, list[str]]:
    """A logo SVG reduced to static drawing, and a list of what was removed.

    Keeps an allowlist of shapes, gradients, clips, masks, text and local `<use>`; keeps an allowlist
    of presentation attributes whose values reference nothing outside the file. Removes scripts,
    event handlers, `foreignObject`, images, animation, filters, links, comments, processing
    instructions and any external reference. Raises Refused when the file is not parseable as plain
    UTF-8 SVG, is too large, or has nothing left: then use the PNG crop instead and add a review
    item. The framework sanitises SVG again when it inlines one in a slide; this is the first layer.

    `allow_images` (layout art only) keeps `<image>` elements whose href is an embedded PNG or JPEG data URI, after
    checking and re-encoding it (`_clean_data_image`); any other image, and any external href, is removed.
    """
    limit = MAX_LAYOUT_ART_SVG_BYTES if allow_images else MAX_SVG_BYTES
    if len(raw) > limit:
        raise Refused(f"SVG larger than {limit // (1024 * 1024)} MB")
    try:
        text = raw.decode("utf-8-sig", "strict")
    except UnicodeDecodeError:
        raise Refused("SVG is not UTF-8") from None
    # A plain public DOCTYPE (Illustrator writes one) carries nothing; one with an internal subset does.
    text = re.sub(r"<!DOCTYPE\s+svg\s+PUBLIC\s+\"[^\"<>\[\]]*\"\s+\"[^\"<>\[\]]*\"\s*>", "", text, count=1)
    root = parse_xml(text.encode("utf-8"), "SVG")
    removed: list[str] = []
    count = 0

    def local(tag) -> tuple[str | None, str]:
        if not isinstance(tag, str):
            return None, ""
        if tag.startswith("{"):
            ns, _, name = tag[1:].partition("}")
            return ns, name
        return "", tag

    def clean(el: ET.Element, depth: int) -> ET.Element | None:
        nonlocal count
        count += 1
        if count > MAX_SVG_ELEMENTS or depth > MAX_SVG_DEPTH:
            raise Refused("SVG has too many or too deeply nested elements")
        ns, name = local(el.tag)
        if ns not in ("", SVG_NS) or (name not in _SVG_ELEMENTS and not (allow_images and name == "image")):
            removed.append(f"<{name or '?'}>")
            return None
        out = ET.Element(f"{{{SVG_NS}}}{name}")
        for key, value in el.attrib.items():
            ans, aname = local(key)
            if name == "image":
                if aname == "href" and ans in ("", XLINK_NS):
                    cleaned_uri = _clean_data_image(value)
                    if cleaned_uri is None:
                        removed.append("<image>")
                        return None
                    out.set("href", cleaned_uri)
                elif ans == "" and aname in _IMAGE_ATTRIBUTES and len(value) < 2000 and _value_ok(value):
                    out.set(aname, value)
                continue
            if aname == "href" and ans in ("", XLINK_NS):
                if name in _HREF_ELEMENTS and _LOCAL_REF.match(value.strip()):
                    out.set("href", value.strip())
                else:
                    removed.append(f"{name} href")
                continue
            if ans == XML_NS and aname == "space" and value in ("preserve", "default"):
                out.set(key, value)
                continue
            if ans != "" or aname not in _SVG_ATTRIBUTES or len(value) > 200000 or not _value_ok(value):
                removed.append(f"{name} {aname}" + ("" if aname in _SVG_ATTRIBUTES else " (not allowed)"))
                continue
            out.set(aname, value)
        if name == "use" and out.get("href") is None:
            return None
        if name == "style":
            css = "".join(el.itertext())
            if len(el) or not _value_ok(css) or len(css) > 200000:
                removed.append("<style> (external reference or escape)")
                return None
            out.text = css
            return out
        if name in ("title", "desc", "text", "tspan"):
            out.text = el.text
        for child in el:
            kept = clean(child, depth + 1)
            if kept is not None:
                if name in ("text", "tspan"):
                    kept.tail = child.tail
                out.append(kept)
        return out

    cleaned = clean(root, 0)
    if cleaned is None or local(root.tag)[1] != "svg":
        raise Refused("the root element is not <svg>")
    if not any(local(e.tag)[1] in ("path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use", "image") for e in cleaned.iter()):
        raise Refused("nothing drawable is left after sanitising")
    ET.register_namespace("", SVG_NS)
    body = ET.tostring(cleaned, encoding="unicode")
    return (body + "\n").encode("utf-8"), sorted(set(removed))


# --------------------------------------------------------------------------- zip archives


class BoundedZip:
    """A zip archive (PPTX, DOCX) read within limits.

    Refuses on open when the central directory lists too many entries, an entry too large, too much
    in total, or a compression ratio no real document has. Sizes in the directory can lie, so every
    read is also cut off at the entry limit and counted against the total.
    """

    def __init__(self, path, max_entries: int = 5000, max_entry_bytes: int = 200 * 1024 * 1024,
                 max_total_bytes: int = 1024 * 1024 * 1024, max_ratio: int = 250):
        self.max_entry_bytes, self.max_total_bytes = max_entry_bytes, max_total_bytes
        self.read_total = 0
        try:
            self.zip = zipfile.ZipFile(path)
        except (zipfile.BadZipFile, OSError) as exc:
            raise Refused(f"not a readable zip archive ({exc})") from None
        infos = self.zip.infolist()
        if len(infos) > max_entries:
            raise Refused(f"the archive lists {len(infos)} entries (limit {max_entries})")
        total = 0
        for info in infos:
            if info.file_size > max_entry_bytes:
                raise Refused(f"{info.filename[:80]!r} is {info.file_size} bytes uncompressed (limit {max_entry_bytes})")
            if info.file_size > 1024 * 1024 and info.file_size > max_ratio * max(info.compress_size, 1):
                raise Refused(f"{info.filename[:80]!r} expands {info.file_size // max(info.compress_size, 1)} times (limit {max_ratio}); it looks like a zip bomb")
            total += info.file_size
        if total > max_total_bytes:
            raise Refused(f"the archive is {total} bytes uncompressed (limit {max_total_bytes})")
        self.names = {info.filename for info in infos}

    def read(self, name: str, limit: int | None = None) -> bytes:
        limit = min(limit or self.max_entry_bytes, self.max_entry_bytes)
        with self.zip.open(name) as handle:
            data = handle.read(limit + 1)
        if len(data) > limit:
            raise Refused(f"{name[:80]!r} is larger than {limit} bytes")
        self.read_total += len(data)
        if self.read_total > self.max_total_bytes:
            raise Refused(f"more than {self.max_total_bytes} bytes read from the archive")
        return data


_SAFE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,80}\Z")


def safe_file_name(name: str, fallback: str) -> str:
    """A file name taken from an archive entry or URL, when it is plain; otherwise the fallback."""
    base = name.replace("\\", "/").rsplit("/", 1)[-1]
    return base if _SAFE_NAME.match(base) and ".." not in base else fallback


def capped_zoom(width: float, height: float, target_width: float, max_pixels: int = MAX_PIXELS) -> tuple[float, bool]:
    """The zoom that renders a page `target_width` pixels wide, lowered when the page's shape would make the
    image larger than `max_pixels` (a page a hair wide and a mile long). Returns (zoom, lowered)."""
    if not (width > 0 and height > 0):
        raise Refused("a page with no size")
    zoom = target_width / width
    pixels = (width * zoom) * (height * zoom)
    if pixels <= max_pixels:
        return zoom, False
    return (max_pixels / (width * height)) ** 0.5, True


def check_file_size(path, limit: int, what: str) -> None:
    size = os.path.getsize(path)
    if size > limit:
        raise Refused(f"{what} is {size} bytes (limit {limit})")
