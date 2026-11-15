# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10", "numpy>=1.26"]
# ///
"""Extract brand evidence from a PPTX into extraction.json plus assets.

Usage:
  uv run extract_pptx.py <deck.pptx> --out <dir>
      [--no-render] [--pdf <already-exported.pdf>] [--soffice "<command>"] [--renderer auto|soffice|keynote|none]

The OOXML parse uses only the standard library. Rendering slides to PNG needs one of:
  - LibreOffice (`soffice` on PATH, or --soffice "docker run ... soffice") plus poppler's `pdftoppm`
  - a PDF you exported yourself from PowerPoint, Keynote or Google Slides (--pdf)
  - Keynote on macOS (--renderer keynote; opens the app)

Writes:
  <out>/extraction.json
  <out>/pages/page-NNN.png, <out>/pages/contact-sheet.png   (when rendering is available)
  <out>/assets/media/                                        every file from ppt/media
  <out>/source.pdf                                           the intermediate PDF, when one was made
"""
from __future__ import annotations

import argparse
import io
import colorsys
import posixpath
import re
import shlex
import shutil
import subprocess
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).parent))
import _common as C  # noqa: E402
import _filesafe as F  # noqa: E402

# Where external relationships point in the copy a renderer opens: a URL no renderer fetches.
OFFLINE_TARGET = "about:blank"

# A relationship target that leaves the package whatever its TargetMode: a URI with a scheme
# (https:, file:, smb:) or a UNC path (\\host\share, //host/share).
REMOTE_TARGET = re.compile(r"\s*(?:[A-Za-z][A-Za-z0-9+.-]*:|[\\/]{2})")

# The first bytes of an OLE compound file, the container of legacy embedded objects.
CFB_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

# Relationship types (the last segment of the Type URI) whose target is an embedded object.
EMBEDDING_RELATIONSHIPS = {"oleobject", "package", "control", "activexcontrol", "activexcontrolbinary", "attachedtemplate"}

# The SVG namespace; any element in it makes a part SVG to a renderer, whatever the part is called.
SVG_NAMESPACE = "http://www.w3.org/2000/svg"

# The first bytes of gzip data (SVGZ, among others).
GZIP_MAGIC = b"\x1f\x8b"

# The DIB header sizes a real BMP has after its 14-byte file header (BITMAPCOREHEADER to V5).
BMP_HEADER_SIZES = {12, 40, 52, 56, 64, 108, 124}

# The content types PowerPoint declares for embedded fonts, matched exactly.
EMBEDDED_FONT_TYPES = {"application/x-fontdata", "application/vnd.openxmlformats-officedocument.obfuscatedfont"}

# What an SVG part that can't be cleaned is replaced with in the render copy.
EMPTY_SVG = b'<svg xmlns="http://www.w3.org/2000/svg"/>'

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
A, P, R, CH = (f"{{{NS[k]}}}" for k in ("a", "p", "r", "c"))
PRESET_COLORS = {"black": "000000", "white": "FFFFFF", "red": "FF0000", "green": "008000", "blue": "0000FF", "gray": "808080", "grey": "808080"}
DEFAULT_CLRMAP = {"bg1": "lt1", "tx1": "dk1", "bg2": "lt2", "tx2": "dk2"}
CHART_KINDS = {"barChart": "bar", "bar3DChart": "bar", "lineChart": "line", "line3DChart": "line", "pieChart": "pie", "pie3DChart": "pie",
               "doughnutChart": "donut", "areaChart": "area", "area3DChart": "area", "scatterChart": "scatter", "bubbleChart": "bubble",
               "radarChart": "radar", "stockChart": "stock", "ofPieChart": "pie"}


class Pkg:
    def __init__(self, path: Path):
        # Entry count, per-entry size, total size and compression ratio are limited: a deck is untrusted input.
        self.zip = F.BoundedZip(path)
        self.names = self.zip.names
        self._xml: dict[str, ET.Element] = {}

    def xml(self, name: str) -> ET.Element | None:
        if name not in self.names:
            return None
        if name not in self._xml:
            # OPC forbids DTDs in package parts. Refusing them closes entity-expansion and XXE tricks
            # in untrusted decks without needing a third-party parser. The part must be UTF-8 first:
            # a byte scan for "<!DOCTYPE" does not see one written in UTF-16.
            self._xml[name] = F.parse_xml(self.zip.read(name, F.MAX_XML_PART_BYTES), name[:120])
        return self._xml[name]

    def rels(self, part: str) -> dict[str, dict]:
        d, f = posixpath.split(part)
        root = self.xml(f"{d}/_rels/{f}.rels")
        out = {}
        if root is None:
            return out
        for rel in root:
            target = rel.get("Target", "")
            if rel.get("TargetMode") != "External":
                target = posixpath.normpath(posixpath.join(d, target)) if not target.startswith("/") else target.lstrip("/")
            out[rel.get("Id")] = {"type": rel.get("Type", "").rsplit("/", 1)[-1], "target": target}
        return out

    def rel_of_type(self, part: str, kind: str) -> str | None:
        for r in self.rels(part).values():
            if r["type"] == kind:
                return r["target"]
        return None


def apply_color_mods(hexv: str, node: ET.Element) -> tuple[str, list[str], float | None]:
    r, g, b = (c / 255 for c in C.hex_to_rgb(hexv))
    mods, alpha = [], None
    for m in node:
        tag = m.tag.replace(A, "")
        val = int(m.get("val", "100000")) / 100000
        if tag == "alpha":
            alpha = val
            continue
        mods.append(f"{tag}={val:g}")
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        if tag == "lumMod":
            l *= val
        elif tag == "lumOff":
            l += val
        elif tag == "satMod":
            s *= val
        elif tag == "tint":
            r, g, b = (c + (1 - c) * (1 - val) for c in (r, g, b))
            continue
        elif tag == "shade":
            r, g, b = (c * val for c in (r, g, b))
            continue
        else:
            continue
        r, g, b = colorsys.hls_to_rgb(h, max(0, min(1, l)), max(0, min(1, s)))
    return C.rgb_to_hex(r * 255, g * 255, b * 255), mods, alpha


class Ctx:
    """Theme colours and fonts plus the master colour map, for resolving references."""

    def __init__(self, theme_colors: dict[str, str], fonts: dict[str, str], clrmap: dict[str, str]):
        self.theme_colors, self.fonts, self.clrmap = theme_colors, fonts, clrmap

    def color(self, parent: ET.Element | None) -> dict | None:
        """Resolve the first colour child of a fill-like element."""
        if parent is None:
            return None
        for node in parent:
            tag = node.tag.replace(A, "")
            ref, base = None, None
            if tag == "srgbClr":
                base = node.get("val")
            elif tag == "schemeClr":
                ref = node.get("val")
                slot = self.clrmap.get(ref, ref)
                base = self.theme_colors.get(slot)
                if ref == "phClr":
                    return {"hex": None, "ref": "phClr"}
                ref = slot if slot in self.theme_colors else ref
            elif tag == "sysClr":
                base = node.get("lastClr") or ("000000" if "Text" in node.get("val", "") else "FFFFFF")
            elif tag == "prstClr":
                base = PRESET_COLORS.get(node.get("val", ""), None)
            else:
                continue
            if not base:
                return {"hex": None, "ref": ref}
            hexv, mods, alpha = apply_color_mods(C.norm_hex(base), node)
            out = {"hex": hexv}
            if ref:
                out["ref"] = ref
            if mods:
                out["mods"] = mods
                out["base_hex"] = C.norm_hex(base)
                if any(m.split("=")[0] in ("tint", "shade", "satMod") for m in mods):
                    # PowerPoint applies these in linear light and LibreOffice differs again: the hex is a rough guess.
                    out["approximate"] = True
            if alpha is not None:
                out["alpha"] = alpha
            return out
        return None

    def font(self, typeface: str | None) -> str | None:
        if not typeface:
            return None
        if typeface.startswith("+mj"):
            return self.fonts.get("major")
        if typeface.startswith("+mn"):
            return self.fonts.get("minor")
        return typeface

    def fill(self, sppr: ET.Element | None) -> dict | None:
        """Fill of a shape-properties or background-properties element."""
        if sppr is None:
            return None
        if sppr.find("a:noFill", NS) is not None:
            return {"kind": "none"}
        solid = sppr.find("a:solidFill", NS)
        if solid is not None:
            c = self.color(solid)
            return {"kind": "solid", **(c or {})}
        grad = sppr.find("a:gradFill", NS)
        if grad is not None:
            stops = []
            for gs in grad.findall("a:gsLst/a:gs", NS):
                c = self.color(gs) or {}
                stops.append({"pos": round(int(gs.get("pos", "0")) / 100000, 4), **c})
            stops.sort(key=lambda s: s["pos"])
            out = {"kind": "gradient", "type": "linear", "stops": stops, "origin": "ooxml"}
            lin = grad.find("a:lin", NS)
            if lin is not None:
                ooxml = int(lin.get("ang", "0")) / 60000
                out["ooxml_angle_deg"] = ooxml
                out["css_angle_deg"] = round((ooxml + 90) % 360)  # OOXML 0 = left to right, clockwise; CSS 90 = left to right
            elif grad.find("a:path", NS) is not None:
                out["type"] = "radial"
                out["path"] = grad.find("a:path", NS).get("path")
            return out
        blip = sppr.find("a:blipFill/a:blip", NS)
        if blip is not None:
            return {"kind": "image", "rid": blip.get(f"{R}embed")}
        if sppr.find("a:pattFill", NS) is not None:
            return {"kind": "pattern"}
        return None

    def line(self, sppr: ET.Element | None) -> dict | None:
        ln = sppr.find("a:ln", NS) if sppr is not None else None
        if ln is None:
            return None
        if ln.find("a:noFill", NS) is not None:
            return {"kind": "none"}
        c = self.color(ln.find("a:solidFill", NS))
        out = {"kind": "solid", **(c or {})}
        if ln.get("w"):
            out["width_pt"] = round(int(ln.get("w")) / 12700, 2)
        dash = ln.find("a:prstDash", NS)
        if dash is not None:
            out["dash"] = dash.get("val")
        return out


def xfrm_of(el: ET.Element) -> dict | None:
    x = el.find(".//a:xfrm", NS)
    if x is None:
        x = el.find("p:xfrm", NS)
    if x is None:
        return None
    off, ext = x.find("a:off", NS), x.find("a:ext", NS)
    if off is None or ext is None:
        return None
    return {"x": int(off.get("x")), "y": int(off.get("y")), "w": int(ext.get("cx")), "h": int(ext.get("cy"))}


def ph_of(el: ET.Element) -> dict | None:
    ph = el.find(".//p:nvPr/p:ph", NS)
    if ph is None:
        return None
    return {"type": ph.get("type", "body" if ph.get("idx") else "obj"), "idx": ph.get("idx", "0")}


def level_styles(node: ET.Element | None, ctx: Ctx) -> dict[int, dict]:
    """lvl1pPr..lvl9pPr -> {level: {size_pt, family, bold, color, align, caps, spacing}}."""
    out: dict[int, dict] = {}
    if node is None:
        return out
    for child in node:
        m = re.match(rf"{re.escape(A)}lvl(\d)pPr", child.tag)
        if not m:
            continue
        st: dict = {}
        if child.get("algn"):
            st["align"] = child.get("algn")
        rpr = child.find("a:defRPr", NS)
        if rpr is not None:
            st.update(run_props(rpr, ctx))
        ls = child.find("a:lnSpc/a:spcPct", NS)
        if ls is not None:
            st["line_height_ratio"] = round(int(ls.get("val")) / 100000 * 1.2, 3)
        if child.find("a:buNone", NS) is not None:
            st["bullet"] = None
        bu = child.find("a:buChar", NS)
        if bu is not None:
            st["bullet"] = bu.get("char")
        out[int(m.group(1))] = st
    return out


def run_props(rpr: ET.Element | None, ctx: Ctx) -> dict:
    st: dict = {}
    if rpr is None:
        return st
    if rpr.get("sz"):
        st["size_pt"] = int(rpr.get("sz")) / 100
    if rpr.get("b") is not None:
        st["bold"] = rpr.get("b") in ("1", "true")
    if rpr.get("i") is not None:
        st["italic"] = rpr.get("i") in ("1", "true")
    if rpr.get("cap") and rpr.get("cap") != "none":
        st["caps"] = rpr.get("cap")
    if rpr.get("spc"):
        st["tracking_pt"] = int(rpr.get("spc")) / 100
    latin = rpr.find("a:latin", NS)
    if latin is not None:
        st["family"] = ctx.font(latin.get("typeface"))
        st["family_ref"] = latin.get("typeface") if latin.get("typeface", "").startswith("+") else None
    c = ctx.color(rpr.find("a:solidFill", NS))
    if c and c.get("hex"):
        st["color"] = c["hex"]
        if c.get("ref"):
            st["color_ref"] = c["ref"]
    return st


KEYNOTE_SCRIPT = """on run argv
  set sourceFile to POSIX file (item 1 of argv)
  set targetFile to POSIX file (item 2 of argv)
  tell application "Keynote"
    set d to open sourceFile
    delay 2
    export d to targetFile as PDF
    close d saving no
  end tell
end run"""


def keynote_command(pptx: Path, target: Path) -> list[str]:
    """The osascript call that has Keynote export a deck as PDF. The script is fixed text; the two paths are
    passed as arguments (`on run argv`), never written into the script, so a file name with quotes or line
    breaks stays a file name."""
    return ["osascript", "-e", KEYNOTE_SCRIPT, str(pptx.resolve()), str(target.resolve())]


def offline_copy(pptx: Path, target: Path) -> int:
    """Writes a copy of the deck that a renderer can open without making a network request on its
    behalf, and returns how many references and parts were neutralised.

    The copy works from an allowlist instead of trying to recognise every hostile format:
    - Every relationship that is external, or whose target is an absolute URI or a UNC path (which
      would reach an SMB share), points to `about:blank`; ids stay, so the deck still opens.
    - Every part an OLE object, package, ActiveX control or attached template relationship points
      at, and anything under `ppt/embeddings/`, is emptied; the slide shows its preview picture.
    - Anything that carries other files (a zip, even one appended to an image, or an OLE compound
      file) is emptied whatever it is called or declared as.
    - A part that is XML must be UTF-8, well formed and without a DTD, or it is emptied; it is kept
      as it is unless any element is in the SVG namespace or called `svg`, or it is declared as SVG,
      in which case it is reduced to static drawing.
    - Any other part is kept only when its header is a raster or metafile format (PNG, JPEG, GIF,
      BMP, TIFF, WebP, EMF, WMF) or a font: font magic bytes, or an embedded font declared with an
      exact embedded-font content type under `ppt/fonts/` and reached only through font
      relationships. Everything else, including compressed data such as SVGZ, is emptied.
    Refuses a deck whose part names differ only in case, since readers disagree on which one wins,
    and a relationships part that isn't a plain OPC relationships list.

    This removes the deck's own ways of reaching the network. For a deck from someone you don't
    trust, also render with networking off (`--soffice` with `docker run --network none`).
    """
    source = F.BoundedZip(pptx)
    infos = source.zip.infolist()
    if len({info.filename.lower() for info in infos}) != len(infos):
        raise F.Refused("two parts have names that differ only in case")
    content_types = _declared_content_types(source)
    targets = _relationship_targets(source, infos)
    neutralised = 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as out:
        for info in infos:
            data = source.read(info.filename)
            lower = info.filename.lower()
            if lower.endswith(".rels"):
                data, count = _offline_relationships(data, info.filename)
                neutralised += count
            elif targets.get(lower, set()) & EMBEDDING_RELATIONSHIPS or lower.startswith("ppt/embeddings/") or _is_container(data):
                data = b""
                neutralised += 1
            elif _looks_like_xml(data):
                root = _xml_root(data, info.filename)
                if root is None:
                    data = b""
                    neutralised += 1
                elif _has_svg(root) or "svg" in content_types(info.filename):
                    data = _static_svg(data)
                    neutralised += 1
            elif not (_is_inert_binary(data) or _is_font(lower, data, content_types(info.filename), targets.get(lower, set()))):
                data = b""
                neutralised += 1
            out.writestr(info, data)
    return neutralised


def _declared_content_types(source: "F.BoundedZip"):
    """A lookup from part name to the content type `[Content_Types].xml` declares for it, lower-cased,
    or an empty string when there is none. Part names are percent-decoded before comparing."""
    defaults: dict[str, str] = {}
    overrides: dict[str, str] = {}
    if "[Content_Types].xml" in source.names:
        root = F.parse_xml(source.read("[Content_Types].xml"), "[Content_Types].xml")
        for el in root:
            local = el.tag.rsplit("}", 1)[-1]
            if local == "Default":
                defaults[(el.get("Extension") or "").lower()] = (el.get("ContentType") or "").lower()
            elif local == "Override":
                part = unquote(el.get("PartName") or "").lstrip("/").lower()
                overrides[part] = (el.get("ContentType") or "").lower()

    def lookup(name: str) -> str:
        lower = name.lower()
        return overrides.get(lower) or defaults.get(posixpath.splitext(lower)[1].lstrip("."), "")

    return lookup


def _relationship_targets(source: "F.BoundedZip", infos) -> dict[str, set[str]]:
    """Every part a relationship points at (lower-cased, resolved against the relationships part's
    source folder and percent-decoded), with the relationship types (the last segment of the Type
    URI, lower-cased) that point at it."""
    targets: dict[str, set[str]] = defaultdict(set)
    for info in infos:
        name = info.filename
        if not name.lower().endswith(".rels"):
            continue
        root = F.parse_xml(source.read(name), name)
        folder = posixpath.dirname(posixpath.dirname(name))
        for rel in root:
            target = unquote(rel.get("Target") or "")
            if REMOTE_TARGET.match(target):
                continue
            resolved = target.lstrip("/") if target.startswith("/") else posixpath.join(folder, target)
            kind = (rel.get("Type") or "").rsplit("/", 1)[-1].lower()
            targets[posixpath.normpath(resolved).lower()].add(kind)
    return targets


def _is_container(data: bytes) -> bool:
    """True for anything that carries other files: a zip (even one appended to an image, which
    `is_zipfile` finds from the end) or an OLE compound file anywhere in the bytes."""
    return CFB_MAGIC in data or zipfile.is_zipfile(io.BytesIO(data))


def _xml_root(data: bytes, name: str) -> ET.Element | None:
    """The part parsed as XML when it is UTF-8, has no DTD and is well formed, else None, so an
    encoding trick or a malformed part can't hide an SVG element from the check that looks for one."""
    try:
        return F.parse_xml(data, name)
    except F.Refused:
        return None


def _has_svg(root: ET.Element) -> bool:
    """True when any element is in the SVG namespace or is called `svg`, whatever its prefix."""
    for el in root.iter():
        tag = el.tag if isinstance(el.tag, str) else ""
        namespace, _, local = tag.rpartition("}")
        if namespace.lstrip("{") == SVG_NAMESPACE or local.lower() == "svg":
            return True
    return False


def _is_font(lower_name: str, data: bytes, declared: str, kinds: set[str]) -> bool:
    """True for a real font file, or an embedded (obfuscated) font, which has no magic bytes of its
    own: one declared with an exact embedded-font content type, kept under `ppt/fonts/`, reached
    only through font relationships, and not compressed or SVG in disguise."""
    if F.sniff(data) in ("ttf", "otf", "woff", "woff2"):
        return True
    return (
        declared in EMBEDDED_FONT_TYPES
        and lower_name.startswith("ppt/fonts/")
        and kinds <= {"font"}
        and data[:2] != GZIP_MAGIC
        and F.sniff(data) != "svg"
    )


def _looks_like_xml(data: bytes) -> bool:
    return data[:64].lstrip(b"\xef\xbb\xbf \t\r\n").startswith(b"<")


def _is_inert_binary(data: bytes) -> bool:
    """True when the first bytes are a raster or metafile format a renderer draws without fetching."""
    if data[:8] == b"\x89PNG\r\n\x1a\n" or data[:3] == b"\xff\xd8\xff" or data[:6] in (b"GIF87a", b"GIF89a"):
        return True
    if data[:2] == b"BM" and int.from_bytes(data[14:18], "little") in BMP_HEADER_SIZES:
        return True
    if data[:4] in (b"II*\x00", b"MM\x00*") or (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        return True
    if data[:4] == b"\x01\x00\x00\x00" and data[40:44] == b" EMF":
        return True
    return data[:4] == b"\xd7\xcd\xc6\x9a" or data[:6] in (b"\x01\x00\x09\x00\x00\x03", b"\x02\x00\x09\x00\x00\x03")


def _offline_relationships(data: bytes, name: str) -> tuple[bytes, int]:
    root = F.parse_xml(data, name)
    if root.tag != f"{{{NS['rel']}}}Relationships":
        raise F.Refused(f"{name[:80]!r} is not an OPC relationships part")
    count = 0
    for rel in root.iter():
        if rel is root:
            continue
        if rel.tag != f"{{{NS['rel']}}}Relationship":
            raise F.Refused(f"{name[:80]!r} holds an element other than a relationship")
        external = (rel.get("TargetMode") or "").strip().lower() == "external"
        if external or REMOTE_TARGET.match(rel.get("Target") or ""):
            rel.set("Target", OFFLINE_TARGET)
            count += 1
    ET.register_namespace("", NS["rel"])
    return ET.tostring(root, encoding="UTF-8", xml_declaration=True), count


def _static_svg(data: bytes) -> bytes:
    """An SVG part reduced to static drawing, or an empty drawing when it can't be cleaned."""
    try:
        return F.sanitize_svg(data)[0]
    except (F.Refused, ValueError, ET.ParseError):
        return EMPTY_SVG


def render(pptx: Path, out: Path, renderer: str, soffice_cmd: str | None, pdf: Path | None, width: int, warnings: list[str]) -> list[Path]:
    pages_dir = out / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    made_pdf = pdf
    if pdf is not None:
        shutil.copy(pdf, out / "source.pdf")
    if made_pdf is None and renderer in ("auto", "soffice"):
        cmd = shlex.split(soffice_cmd) if soffice_cmd else None
        if cmd is None:
            exe = shutil.which("soffice") or shutil.which("libreoffice")
            mac = Path("/Applications/LibreOffice.app/Contents/MacOS/soffice")
            exe = exe or (str(mac) if mac.exists() else None)
            cmd = [exe] if exe else None
        if cmd:
            work = out / "_render"
            work.mkdir(exist_ok=True)
            src = work / "deck.pptx"
            run = [*cmd, "--headless", "--convert-to", "pdf", "--outdir", str(work), str(src)]
            if soffice_cmd and "{dir}" in soffice_cmd:
                # Container wrappers: '{dir}' is replaced by the host work directory, and soffice runs on /work inside.
                run = shlex.split(soffice_cmd.replace("{dir}", str(work.resolve()))) + ["--headless", "--convert-to", "pdf", "--outdir", "/work", "/work/deck.pptx"]
            try:
                # A deck refused here (case-twin parts, packages nested too deep) is never handed to the renderer.
                if offline_copy(pptx, src):
                    warnings.append("External links and embedded objects were disabled for rendering; linked pictures render blank.")
                subprocess.run(run, check=True, capture_output=True, timeout=300)
                if (work / "deck.pdf").exists():
                    made_pdf = out / "source.pdf"
                    shutil.move(work / "deck.pdf", made_pdf)
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"LibreOffice render failed: {str(exc)[-600:]}" + (f" | stderr: {str(getattr(exc, 'stderr', '') or '')[-400:]}" if getattr(exc, "stderr", None) else ""))
            shutil.rmtree(work, ignore_errors=True)
    if made_pdf is None and renderer == "keynote" and sys.platform == "darwin":
        target = out / "source.pdf"
        try:
            subprocess.run(keynote_command(pptx, target), check=True, capture_output=True, timeout=180)
            made_pdf = target if target.exists() else None
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"Keynote render failed: {str(exc)[:200]}")
    if made_pdf is None:
        warnings.append("No slide images. Install LibreOffice (or pass --soffice), export a PDF from the presentation app and pass --pdf, "
                        "or use --renderer keynote on macOS. Synthesis without page images is unreliable.")
        return []
    images: list[Path] = []
    if shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-png", "-l", str(F.MAX_RENDER_PAGES), "-scale-to-x", str(width), "-scale-to-y", "-1", str(made_pdf), str(pages_dir / "p")],
                       check=True, capture_output=True, timeout=900)
        for i, f in enumerate(sorted(pages_dir.glob("p-*.png"), key=lambda p: int(re.search(r"(\d+)\.png$", p.name).group(1)))):
            dest = pages_dir / f"page-{i + 1:03d}.png"
            f.rename(dest)
            images.append(dest)
    else:
        try:
            import pymupdf  # noqa: PLC0415

            doc = pymupdf.open(made_pdf)
            for i, page in enumerate(doc):
                if i >= F.MAX_RENDER_PAGES:
                    warnings.append(f"Only the first {F.MAX_RENDER_PAGES} pages were rendered.")
                    break
                dest = pages_dir / f"page-{i + 1:03d}.png"
                z, lowered = F.capped_zoom(page.rect.width, page.rect.height, width)
                if lowered:
                    warnings.append(f"page {i + 1}: rendered smaller than asked, its shape would need more than {F.MAX_PIXELS} pixels")
                page.get_pixmap(matrix=pymupdf.Matrix(z, z)).save(dest)
                images.append(dest)
        except ImportError:
            warnings.append("A PDF was produced but neither pdftoppm (poppler) nor PyMuPDF is available to rasterise it. Run extract_pdf.py on source.pdf.")
    return images


def parse_chart(pkg: Pkg, part: str, ctx: Ctx) -> dict:
    root = pkg.xml(part)
    out: dict = {"part": part, "origin": "ooxml-chart", "confidence": 1.0, "plots": [], "series": []}
    if root is None:
        return out
    accents = [ctx.theme_colors.get(f"accent{i}") for i in range(1, 7)]
    plot_area = root.find(".//c:plotArea", NS)
    ser_index = 0
    for plot in list(plot_area) if plot_area is not None else []:
        kind = CHART_KINDS.get(plot.tag.replace(CH, ""))
        if not kind:
            continue
        pinfo = {"kind": kind}
        bar_dir = plot.find("c:barDir", NS)
        if bar_dir is not None:
            pinfo["direction"] = "horizontal" if bar_dir.get("val") == "bar" else "vertical"
        for key, tag in (("grouping", "c:grouping"), ("gap_width_pct", "c:gapWidth"), ("overlap_pct", "c:overlap"), ("hole_size_pct", "c:holeSize")):
            n = plot.find(tag, NS)
            if n is not None:
                pinfo[key] = n.get("val")
        vary = plot.find("c:varyColors", NS)
        pinfo["vary_colors_by_point"] = vary is not None and vary.get("val", "1") in ("1", "true")
        dl = plot.find("c:dLbls", NS)
        pinfo["data_labels"] = parse_dlbls(dl, ctx)
        out["plots"].append(pinfo)
        for ser in plot.findall("c:ser", NS):
            name = ser.find("c:tx//c:v", NS)
            sppr = ser.find("c:spPr", NS)
            fill = ctx.fill(sppr)
            line = ctx.line(sppr)
            s: dict = {"name": name.text if name is not None else None, "plot": kind}
            color, source = None, "explicit"
            if fill and fill.get("kind") == "solid" and fill.get("hex"):
                color = fill["hex"]
                if fill.get("ref"):
                    s["color_ref"] = fill["ref"]
            elif kind in ("line", "scatter", "radar") and line and line.get("hex"):
                color = line["hex"]
                if line.get("ref"):
                    s["color_ref"] = line["ref"]
            else:
                # No explicit colour: PowerPoint cycles the theme accents in order.
                acc = accents[ser_index % 6]
                color, source = (C.norm_hex(acc) if acc else None), f"theme-order:accent{ser_index % 6 + 1}"
            s["color"], s["color_source"] = color, source
            if line and line.get("kind") == "solid":
                s["line"] = {k: line[k] for k in ("hex", "width_pt", "dash") if k in line}
            marker = ser.find("c:marker/c:symbol", NS)
            if marker is not None:
                s["marker"] = marker.get("val")
            smooth = ser.find("c:smooth", NS)
            if smooth is not None:
                s["smooth"] = smooth.get("val") in ("1", "true")
            pts = []
            for dpt in ser.findall("c:dPt", NS):
                f2 = ctx.fill(dpt.find("c:spPr", NS))
                if f2 and f2.get("hex"):
                    pts.append({"index": int(dpt.find("c:idx", NS).get("val")), "color": f2["hex"]})
            if pts:
                s["point_overrides"] = pts
            sdl = ser.find("c:dLbls", NS)
            if sdl is not None:
                s["data_labels"] = parse_dlbls(sdl, ctx)
            cats = ser.findall("c:cat//c:pt", NS)
            vals = [v.text for v in ser.findall("c:val//c:pt/c:v", NS)]
            s["points"] = len(vals) or len(cats)
            fmt = ser.find("c:val//c:formatCode", NS)
            if fmt is not None:
                s["source_number_format"] = fmt.text
            out["series"].append(s)
            ser_index += 1
    out["kind"] = out["plots"][0]["kind"] if out["plots"] else None
    out["series_colors"] = [s["color"] for s in out["series"] if s.get("color")]
    if out["plots"] and out["plots"][0]["vary_colors_by_point"] and len(out["series"]) == 1 and not out["series"][0].get("point_overrides"):
        out["series_colors"] = [C.norm_hex(a) for a in accents if a]
        out["series"][0]["color_source"] = "theme-order:by-point"
    axes = []
    for ax in (plot_area.findall("c:catAx", NS) + plot_area.findall("c:valAx", NS) + plot_area.findall("c:dateAx", NS)) if plot_area is not None else []:
        a: dict = {"type": ax.tag.replace(CH, "")}
        dele = ax.find("c:delete", NS)
        a["visible"] = not (dele is not None and dele.get("val", "1") in ("1", "true"))
        grid = ax.find("c:majorGridlines", NS)
        if grid is not None:
            ln = ctx.line(grid.find("c:spPr", NS))
            a["gridlines"] = {"color": (ln or {}).get("hex"), "width_pt": (ln or {}).get("width_pt"), "dash": (ln or {}).get("dash", "solid"),
                              "explicit_style": ln is not None}
        else:
            a["gridlines"] = None
        ln = ctx.line(ax.find("c:spPr", NS))
        a["axis_line"] = None if ln and ln.get("kind") == "none" else ({"color": ln.get("hex"), "width_pt": ln.get("width_pt")} if ln else "default")
        nf = ax.find("c:numFmt", NS)
        if nf is not None:
            a["number_format"] = nf.get("formatCode")
        tick = ax.find("c:majorTickMark", NS)
        if tick is not None:
            a["tick_marks"] = tick.get("val")
        tl = ax.find("c:tickLblPos", NS)
        if tl is not None:
            a["tick_labels"] = tl.get("val")
        a["label_text"] = run_props(ax.find("c:txPr//a:defRPr", NS), ctx)
        a["has_title"] = ax.find("c:title", NS) is not None
        axes.append(a)
    out["axes"] = axes
    legend = root.find(".//c:legend", NS)
    if legend is not None:
        pos = legend.find("c:legendPos", NS)
        out["legend"] = {"position": pos.get("val") if pos is not None else "r", "text": run_props(legend.find("c:txPr//a:defRPr", NS), ctx)}
    else:
        out["legend"] = None
    out["has_title"] = root.find("c:chart/c:title", NS) is not None and (root.find("c:chart/c:autoTitleDeleted", NS) is None
                                                                        or root.find("c:chart/c:autoTitleDeleted", NS).get("val") in ("0", "false"))
    tx = root.find("c:txPr//a:defRPr", NS)
    out["text"] = run_props(tx, ctx)
    style = root.find("c:style", NS)
    if style is not None:
        out["builtin_style_id"] = style.get("val")
    rels = pkg.rels(part)
    out["has_style_parts"] = any(r["type"] in ("chartStyle", "chartColorStyle") for r in rels.values())
    for r in rels.values():
        if r["type"] == "chartColorStyle":
            cs = pkg.xml(r["target"])
            if cs is not None:
                cols = [ctx.color(_wrap(n)) for n in cs if n.tag.startswith(A)]
                out["color_style"] = [c["hex"] if c and c.get("hex") else None for c in cols]
    return out


def _wrap(node: ET.Element) -> ET.Element:
    w = ET.Element("w")
    w.append(node)
    return w


def parse_dlbls(dl: ET.Element | None, ctx: Ctx) -> dict | None:
    if dl is None:
        return None
    show = dl.find("c:showVal", NS)
    dele = dl.find("c:delete", NS)
    if dele is not None and dele.get("val", "1") in ("1", "true"):
        return {"shown": False}
    out: dict = {"shown": show is not None and show.get("val", "1") in ("1", "true")}
    nf = dl.find("c:numFmt", NS)
    if nf is not None:
        out["number_format"] = nf.get("formatCode")
    pos = dl.find("c:dLblPos", NS)
    if pos is not None:
        out["position"] = pos.get("val")
    out["text"] = run_props(dl.find("c:txPr//a:defRPr", NS), ctx)
    for key, tag in (("show_series_name", "c:showSerName"), ("show_category", "c:showCatName"), ("show_percent", "c:showPercent")):
        n = dl.find(tag, NS)
        if n is not None and n.get("val", "1") in ("1", "true"):
            out[key] = True
    return out


def parse_table(tbl: ET.Element, ctx: Ctx) -> dict:
    pr = tbl.find("a:tblPr", NS)
    flags = {k: pr.get(k) in ("1", "true") for k in ("firstRow", "bandRow", "firstCol", "lastRow", "bandCol")} if pr is not None else {}
    style_id = pr.find("a:tableStyleId", NS).text if pr is not None and pr.find("a:tableStyleId", NS) is not None else None
    rows = tbl.findall("a:tr", NS)

    def row_style(tr: ET.Element) -> dict:
        fills, texts, borders = Counter(), Counter(), Counter()
        for tc in tr.findall("a:tc", NS):
            tcpr = tc.find("a:tcPr", NS)
            f = ctx.fill(tcpr)
            if f and f.get("hex"):
                fills[f["hex"]] += 1
            if tcpr is not None:
                for side in ("lnB", "lnT", "lnL", "lnR"):
                    ln = tcpr.find(f"a:{side}", NS)
                    if ln is not None and ln.find("a:noFill", NS) is None:
                        c = ctx.color(ln.find("a:solidFill", NS))
                        if c and c.get("hex"):
                            borders[(side[-1], c["hex"], round(int(ln.get("w", "12700")) / 12700, 2))] += 1
            for r in tc.findall(".//a:r", NS):
                st = run_props(r.find("a:rPr", NS), ctx)
                texts[(st.get("family"), st.get("size_pt"), st.get("bold"), st.get("color"))] += len((r.find("a:t", NS).text or "") if r.find("a:t", NS) is not None else "")
        t = texts.most_common(1)[0][0] if texts else (None, None, None, None)
        return {"fill": fills.most_common(1)[0][0] if fills else None,
                "text": {"family": t[0], "size_pt": t[1], "bold": t[2], "color": t[3]},
                "borders": [{"side": k[0], "color": k[1], "width_pt": k[2]} for k, _ in borders.most_common(4)]}

    body_rows = [row_style(tr) for tr in rows[1:4]]
    body_fills = [b["fill"] for b in body_rows]
    sample = []
    for tr in rows[:4]:
        sample.append([("".join(t.text or "" for t in tc.findall(".//a:t", NS)))[:24] for tc in tr.findall("a:tc", NS)])
    nums = [C.number_format_of(cell) for row in sample[1:] for cell in row]
    return {
        "origin": "ooxml-table", "rows": len(rows), "cols": len(tbl.findall("a:tblGrid/a:gridCol", NS)),
        "style_flags": flags, "table_style_id": style_id,
        "explicit_cell_styling": any(b["fill"] for b in body_rows) or bool(rows and row_style(rows[0])["fill"]),
        "header": row_style(rows[0]) if rows else None,
        "body": body_rows[0] if body_rows else None,
        "banded_guess": len(set(body_fills)) > 1 or flags.get("bandRow", False),
        "number_formats": [n for n in nums if n][:8],
        "sample": sample,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pptx", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--renderer", choices=("auto", "soffice", "keynote", "none"), default="auto")
    ap.add_argument("--soffice", default=None, help='command used instead of soffice, e.g. "docker run --rm -v {dir}:/work IMAGE soffice"')
    ap.add_argument("--pdf", type=Path, default=None, help="a PDF export of the same deck, used for the page images")
    ap.add_argument("--render-width", type=int, default=1920)
    ap.add_argument("--source-type", default="pptx")
    args = ap.parse_args()

    pkg = Pkg(args.pptx)
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []

    pres_part = "ppt/presentation.xml"
    pres = pkg.xml(pres_part)
    if pres is None:
        sys.exit("Not a PPTX: ppt/presentation.xml is missing (a .ppt or .key file must be converted first).")
    sz = pres.find("p:sldSz", NS)
    SW, SH = int(sz.get("cx")), int(sz.get("cy"))
    to_canvas = 1080 / (SH / 12700)  # pt -> canvas px at 1080 high
    pres_rels = pkg.rels(pres_part)

    def nbox(x: dict | None) -> list[float] | None:
        return [round(x["x"] / SW, 4), round(x["y"] / SH, 4), round(x["w"] / SW, 4), round(x["h"] / SH, 4)] if x else None

    # ---- theme (the one the first master points to)
    master_parts = [pres_rels[m.get(f"{R}id")]["target"] for m in pres.findall("p:sldMasterIdLst/p:sldMasterId", NS)]
    def read_theme(part) -> tuple[dict[str, str], dict[str, str], dict]:
        theme = pkg.xml(part) if part else None
        colors: dict[str, str] = {}
        fonts: dict[str, str] = {}
        names: dict = {}
        if theme is not None:
            cs = theme.find(".//a:clrScheme", NS)
            names["colors"] = cs.get("name") if cs is not None else None
            for slot in cs if cs is not None else []:
                node = slot[0]
                # sysClr.val is a system colour name, not an RGB value. lastClr is
                # the saved RGB fallback used when that system colour is unavailable.
                if node.tag == A + "sysClr":
                    value = node.get("lastClr") or ("000000" if "Text" in node.get("val", "") else "FFFFFF")
                else:
                    value = node.get("val") or node.get("lastClr") or "000000"
                colors[slot.tag.replace(A, "")] = value.upper()
            fs = theme.find(".//a:fontScheme", NS)
            names["fonts"] = fs.get("name") if fs is not None else None
            for key, tag in (("major", "a:majorFont"), ("minor", "a:minorFont")):
                n = fs.find(f"{tag}/a:latin", NS) if fs is not None else None
                if n is not None:
                    fonts[key] = n.get("typeface")
        return colors, fonts, names

    # The first master's theme is "the" theme for the summary; every master is still resolved against its OWN theme
    # below, because a deck with one master per background (light, dark, accent) carries one theme per master.
    theme_part = pkg.rel_of_type(master_parts[0], "theme") if master_parts else pkg.rel_of_type(pres_part, "theme")
    theme_colors, theme_fonts, scheme_names = read_theme(theme_part)
    master_themes: dict[str, dict] = {}
    distinct_themes = {tuple(sorted(read_theme(pkg.rel_of_type(m, "theme"))[0].items())) for m in master_parts}
    if len(distinct_themes) > 1:
        warnings.append(f"The deck has {len(master_parts)} slide masters with {len(distinct_themes)} different themes: one master per background. Each is a surface; "
                        "declared.themes lists each master's colours. Read roles per surface from there and from the pages, not from the first theme alone.")
    office_default = theme_colors.get("accent1") in ("4F81BD", "4472C4", "5B9BD5", "156082") and theme_fonts.get("minor") in ("Calibri", "Aptos", "Arial")
    if office_default:
        warnings.append("The theme is an unmodified Office default (accent1 and fonts match a stock theme). The real brand is in the hard-coded values: trust observed usage over the theme.")

    # ---- masters and layouts
    color_uses: dict[str, dict] = defaultdict(lambda: {"text": 0.0, "fill": 0.0, "stroke": 0.0, "background": 0.0, "pages": set(), "refs": set(), "explicit": 0})
    font_uses: dict[str, dict] = defaultdict(lambda: {"chars": 0, "sizes": Counter(), "pages": set(), "bold_chars": 0, "via_theme": 0})
    text_styles: dict[tuple, dict] = {}
    gradients: list[dict] = []
    media_refs: dict[str, dict] = defaultdict(lambda: {"slides": [], "layouts": [], "masters": [], "placements": []})
    radii: Counter = Counter()
    strokes: Counter = Counter()
    masters_out, layouts_out = [], []
    master_info: dict[str, dict] = {}
    layout_info: dict[str, dict] = {}

    def bg_of(root: ET.Element, ctx: Ctx, part: str) -> dict | None:
        bgpr = root.find("p:cSld/p:bg/p:bgPr", NS)
        if bgpr is not None:
            f = ctx.fill(bgpr)
            if f and f.get("kind") == "image":
                rel = pkg.rels(part).get(f.get("rid"))
                f["media"] = rel["target"] if rel else None
            return f
        ref = root.find("p:cSld/p:bg/p:bgRef", NS)
        if ref is not None:
            c = ctx.color(ref)
            return {"kind": "solid", **c, "via": "bgRef"} if c else None
        return None

    def placeholders(root: ET.Element) -> dict[tuple, dict]:
        out_ph = {}
        for sp in root.findall("p:cSld/p:spTree/p:sp", NS) + root.findall("p:cSld/p:spTree/p:pic", NS):
            ph = ph_of(sp)
            if ph:
                out_ph[(ph["type"], ph["idx"])] = {"el": sp, "xfrm": xfrm_of(sp), **ph}
        return out_ph

    def pictures(root: ET.Element, part: str, where: str, label: str) -> list[dict]:
        pics = []
        rels = pkg.rels(part)
        for pic in root.findall(".//p:pic", NS):
            blip = pic.find("p:blipFill/a:blip", NS)
            rel = rels.get(blip.get(f"{R}embed")) if blip is not None else None
            if not rel:
                continue
            box = nbox(xfrm_of(pic))
            name = pic.find("p:nvPicPr/p:cNvPr", NS)
            media_refs[rel["target"]][where].append(label)
            media_refs[rel["target"]]["placements"].append({"on": f"{where[:-1]}:{label}", "bbox": box, "name": name.get("name") if name is not None else None,
                                                             "alt": name.get("descr") if name is not None else None})
            pics.append({"media": rel["target"], "bbox": box})
        return pics

    for mpart in master_parts:
        root = pkg.xml(mpart)
        cm = root.find("p:clrMap", NS)
        clrmap = {k: v for k, v in cm.attrib.items()} if cm is not None else dict(DEFAULT_CLRMAP)
        own_part = pkg.rel_of_type(mpart, "theme")
        own_colors, own_fonts, own_names = read_theme(own_part) if own_part and own_part != theme_part else (theme_colors, theme_fonts, scheme_names)
        master_themes[mpart] = {"master": mpart, "theme": own_part, "name": own_names.get("colors"), "colors": {k: C.norm_hex(v) for k, v in own_colors.items()}, "fonts": own_fonts}
        ctx = Ctx(own_colors or theme_colors, own_fonts or theme_fonts, clrmap)
        tx = root.find("p:txStyles", NS)
        styles = {k: level_styles(tx.find(f"p:{k}", NS) if tx is not None else None, ctx) for k in ("titleStyle", "bodyStyle", "otherStyle")}
        phs = placeholders(root)
        info = {"part": mpart, "ctx": ctx, "styles": styles, "phs": phs, "bg": bg_of(root, ctx, mpart)}
        master_info[mpart] = info
        masters_out.append({
            "part": mpart, "background": info["bg"], "color_map": clrmap,
            "text_styles": {k: {f"lvl{lv}": {kk: vv for kk, vv in st.items() if vv is not None} for lv, st in v.items() if lv <= 3} for k, v in styles.items()},
            "placeholders": [{"type": p["type"], "idx": p["idx"], "bbox": nbox(p["xfrm"])} for p in phs.values()],
            "pictures": pictures(root, mpart, "masters", posixpath.basename(mpart)),
        })
        if info["bg"] and info["bg"].get("kind") == "gradient":
            gradients.append({**info["bg"], "where": f"master:{posixpath.basename(mpart)}"})
        for lid in root.findall("p:sldLayoutIdLst/p:sldLayoutId", NS):
            lpart = pkg.rels(mpart)[lid.get(f"{R}id")]["target"]
            lroot = pkg.xml(lpart)
            lphs = placeholders(lroot)
            name = lroot.find("p:cSld", NS).get("name")
            lbg = bg_of(lroot, ctx, lpart)
            layout_info[lpart] = {"part": lpart, "master": mpart, "phs": lphs, "bg": lbg, "name": name, "type": lroot.get("type"), "used_by": []}
            for ph in lphs.values():
                if ph["xfrm"] is None:
                    mph = phs.get((ph["type"], ph["idx"])) or next((m for m in phs.values() if m["type"] == ph["type"]), None)
                    ph["xfrm"] = mph["xfrm"] if mph else None
                    ph["geometry_from"] = "master"
            if lbg and lbg.get("kind") == "gradient":
                gradients.append({**lbg, "where": f"layout:{name}"})
            layouts_out.append({
                "name": name, "type": lroot.get("type"), "part": lpart, "master": mpart, "background": lbg,
                "placeholders": [{"type": p["type"], "idx": p["idx"], "bbox": nbox(p["xfrm"]),
                                  "text_style": level_styles(p["el"].find("p:txBody/a:lstStyle", NS), ctx).get(1)} for p in lphs.values()],
                "pictures": pictures(lroot, lpart, "layouts", name),
                "show_master_shapes": lroot.get("showMasterSp", "1") in ("1", "true"),
            })

    # ---- slides
    slide_parts = [pres_rels[s.get(f"{R}id")]["target"] for s in pres.findall("p:sldIdLst/p:sldId", NS)]
    pages = []
    charts_out, tables_out, big_candidates = [], [], []
    total_chars = 0

    def effective_style(ph: dict | None, level: int, linfo: dict, minfo: dict, ctx: Ctx, shape_lst: dict) -> dict:
        """Inherit run properties: shape list style -> layout placeholder -> master placeholder -> master text styles."""
        chain: list[dict] = []
        if ph:
            kind = "titleStyle" if ph["type"] in ("title", "ctrTitle") else "bodyStyle" if ph["type"] in ("body", "subTitle", "obj") or ph["type"].startswith("half") else "otherStyle"
        else:
            kind = "otherStyle"
        chain.append(minfo["styles"][kind].get(level, {}))
        if ph:
            mph = minfo["phs"].get((ph["type"], ph["idx"])) or next((m for m in minfo["phs"].values() if m["type"] == ph["type"]), None)
            if mph is None and ph["type"] in ("ctrTitle",):
                mph = next((m for m in minfo["phs"].values() if m["type"] == "title"), None)
            if mph is None and ph["type"] in ("subTitle", "obj"):
                mph = next((m for m in minfo["phs"].values() if m["type"] == "body"), None)
            if mph is not None:
                chain.append(level_styles(mph["el"].find("p:txBody/a:lstStyle", NS), ctx).get(level, {}))
            lph = linfo["phs"].get((ph["type"], ph["idx"])) or next((m for m in linfo["phs"].values() if m["idx"] == ph["idx"]), None)
            if lph is not None:
                chain.append(level_styles(lph["el"].find("p:txBody/a:lstStyle", NS), ctx).get(level, {}))
        chain.append(shape_lst.get(level, {}))
        eff: dict = {}
        for st in chain:
            eff.update({k: v for k, v in st.items() if v is not None})
        return eff

    for sno, spart in enumerate(slide_parts, 1):
        root = pkg.xml(spart)
        lpart = pkg.rel_of_type(spart, "slideLayout")
        linfo = layout_info.get(lpart) or {"phs": {}, "bg": None, "name": None, "type": None, "master": master_parts[0], "used_by": []}
        linfo["used_by"].append(sno)
        minfo = master_info[linfo["master"]]
        ctx: Ctx = minfo["ctx"]
        ovr = root.find("p:clrMapOvr/a:overrideClrMapping", NS)
        if ovr is not None:
            ctx = Ctx(minfo["ctx"].theme_colors, minfo["ctx"].fonts, dict(ovr.attrib))
        rels = pkg.rels(spart)
        bg = bg_of(root, ctx, spart)
        bg_from = "slide"
        if bg is None:
            bg, bg_from = linfo["bg"], "layout"
        if bg is None:
            bg, bg_from = minfo["bg"], "master"
        if bg and bg.get("kind") == "solid" and bg.get("hex"):
            color_uses[bg["hex"]]["background"] += 1
            color_uses[bg["hex"]]["pages"].add(sno)
            if bg.get("ref"):
                color_uses[bg["hex"]]["refs"].add(bg["ref"])
        if bg and bg.get("kind") == "gradient" and bg_from == "slide":
            gradients.append({**bg, "where": f"slide:{sno}"})

        blocks, shapes_out, pics_out = [], [], []
        slide_chars = 0

        def walk(parent: ET.Element) -> None:
            nonlocal slide_chars, total_chars
            for el in parent:
                tag = el.tag.replace(P, "")
                if tag == "grpSp":
                    walk(el)
                    continue
                if tag not in ("sp", "pic", "graphicFrame", "cxnSp"):
                    continue
                ph = ph_of(el)
                x = xfrm_of(el)
                if x is None and ph:
                    lph = linfo["phs"].get((ph["type"], ph["idx"])) or next((m for m in linfo["phs"].values() if m["idx"] == ph["idx"]), None)
                    x = lph["xfrm"] if lph else None
                area = (x["w"] * x["h"]) / (SW * SH) if x else 0
                if tag == "pic":
                    blip = el.find("p:blipFill/a:blip", NS)
                    rel = rels.get(blip.get(f"{R}embed")) if blip is not None else None
                    if rel:
                        nm = el.find("p:nvPicPr/p:cNvPr", NS)
                        media_refs[rel["target"]]["slides"].append(sno)
                        media_refs[rel["target"]]["placements"].append({"on": f"slide:{sno}", "bbox": nbox(x), "name": nm.get("name") if nm is not None else None,
                                                                         "alt": nm.get("descr") if nm is not None else None})
                        pics_out.append({"media": rel["target"], "bbox": nbox(x)})
                    continue
                if tag == "graphicFrame":
                    gd = el.find("a:graphic/a:graphicData", NS)
                    chart_ref = gd.find("c:chart", NS) if gd is not None else None
                    if chart_ref is not None:
                        rel = rels.get(chart_ref.get(f"{R}id"))
                        if rel:
                            chd = parse_chart(pkg, rel["target"], ctx)
                            chd.update({"page": sno, "bbox": nbox(x)})
                            charts_out.append(chd)
                    tbl = gd.find("a:tbl", NS) if gd is not None else None
                    if tbl is not None:
                        td = parse_table(tbl, ctx)
                        td.update({"page": sno, "bbox": nbox(x)})
                        tables_out.append(td)
                        for hexv in filter(None, [(td["header"] or {}).get("fill"), (td["body"] or {}).get("fill")]):
                            color_uses[hexv]["fill"] += area / 2
                            color_uses[hexv]["pages"].add(sno)
                    continue
                sppr = el.find("p:spPr", NS)
                fill, line = ctx.fill(sppr), ctx.line(sppr)
                geom = sppr.find("a:prstGeom", NS) if sppr is not None else None
                shape = {"bbox": nbox(x), "geometry": geom.get("prst") if geom is not None else None}
                if fill and fill.get("kind") == "solid" and fill.get("hex"):
                    u = color_uses[fill["hex"]]
                    u["fill"] += area
                    u["pages"].add(sno)
                    u["refs"].add(fill["ref"]) if fill.get("ref") else u.__setitem__("explicit", u["explicit"] + 1)
                    shape["fill"] = fill["hex"]
                elif fill and fill.get("kind") == "gradient":
                    gradients.append({**fill, "where": f"slide:{sno}:shape"})
                    shape["fill"] = "gradient"
                if line and line.get("kind") == "solid" and line.get("hex"):
                    u = color_uses[line["hex"]]
                    u["stroke"] += 1
                    u["pages"].add(sno)
                    u["refs"].add(line["ref"]) if line.get("ref") else None
                    strokes[(line["hex"], line.get("width_pt"))] += 1
                    shape["stroke"] = line["hex"]
                if geom is not None and x and not ph:
                    prst = geom.get("prst")
                    if prst == "roundRect":
                        adj = geom.find("a:avLst/a:gd", NS)
                        frac = int(adj.get("fmla").split()[-1]) / 100000 if adj is not None else 0.16667
                        rad_emu = frac * min(x["w"], x["h"])
                        radii["pill" if frac >= 0.45 else round(rad_emu / 12700 * to_canvas)] += 1
                    elif prst == "rect" and (fill and fill.get("kind") in ("solid", "gradient")) and area > 0.01:
                        radii[0] += 1
                    elif prst == "ellipse":
                        radii["circle"] += 1
                if shape.get("fill") or shape.get("stroke"):
                    shapes_out.append(shape)

                body = el.find("p:txBody", NS)
                if body is None:
                    continue
                bodypr = body.find("a:bodyPr", NS)
                fit = bodypr.find("a:normAutofit", NS) if bodypr is not None else None
                font_scale = int(fit.get("fontScale", "100000")) / 100000 if fit is not None else 1.0
                shape_lst = level_styles(body.find("a:lstStyle", NS), ctx)
                texts, lead = [], None
                for para in body.findall("a:p", NS):
                    ppr = para.find("a:pPr", NS)
                    level = int(ppr.get("lvl", "0")) + 1 if ppr is not None else 1
                    eff = effective_style(ph, level, linfo, minfo, ctx, shape_lst)
                    for run in para.findall("a:r", NS) + para.findall("a:fld", NS):
                        t = run.find("a:t", NS)
                        text = (t.text or "") if t is not None else ""
                        if not text.strip():
                            continue
                        own = run_props(run.find("a:rPr", NS), ctx)
                        st = {**eff, **{k: v for k, v in own.items() if v is not None}}
                        family = st.get("family") or theme_fonts.get("major" if ph and ph["type"] in ("title", "ctrTitle") else "minor") or "?"
                        via_theme = "family" not in own or bool(own.get("family_ref"))
                        size = round((st.get("size_pt") or 18.0) * font_scale, 1)
                        color = st.get("color") or C.norm_hex(ctx.theme_colors.get(ctx.clrmap.get("tx1", "dk1"), "000000"))
                        n = len(text.strip())
                        slide_chars += n
                        total_chars += n
                        fu = font_uses[family]
                        fu["chars"] += n
                        fu["sizes"][size] += n
                        fu["pages"].add(sno)
                        fu["bold_chars"] += n if st.get("bold") else 0
                        fu["via_theme"] += n if via_theme else 0
                        cu = color_uses[color]
                        cu["text"] += n
                        cu["pages"].add(sno)
                        if st.get("color_ref"):
                            cu["refs"].add(st["color_ref"])
                        elif "color" in own:
                            cu["explicit"] += 1
                        key = (family, bool(st.get("bold")), size, color)
                        ts = text_styles.setdefault(key, {"chars": 0, "pages": set(), "sample": text.strip()[:60], "placeholder": Counter(), "caps": st.get("caps"), "tracking_pt": st.get("tracking_pt")})
                        ts["chars"] += n
                        ts["pages"].add(sno)
                        ts["placeholder"][ph["type"] if ph else "textbox"] += n
                        texts.append(text.strip())
                        cand = {"family": family, "bold": bool(st.get("bold")), "size_pt": size, "color": color, "size_explicit": "size_pt" in own}
                        if lead is None or size > lead["size_pt"]:
                            lead = cand
                        nf = C.number_format_of(text)
                        if nf and any(ch.isdigit() for ch in text):
                            big_candidates.append({"page": sno, "text": text.strip(), **cand, "bbox": nbox(x), "format": nf})
                if texts and lead:
                    blocks.append({"bbox": nbox(x), "placeholder": ph["type"] if ph else None, "text": " / ".join(texts)[:160], **lead,
                                   "size_canvas_px": round(lead["size_pt"] * to_canvas, 1),
                                   "autofit_scale": font_scale if font_scale != 1.0 else None})

        tree = root.find("p:cSld/p:spTree", NS)
        if tree is not None:
            walk(tree)
        pages.append({
            "index": sno, "image": None, "layout": {"name": linfo["name"], "type": linfo["type"]}, "background": {**(bg or {"kind": "unknown"}), "from": bg_from},
            "text_blocks": sorted(blocks, key=lambda b: -b["size_pt"])[:14], "shapes": shapes_out[:30], "images": pics_out,
            "charts": sum(1 for c in charts_out if c["page"] == sno), "tables": sum(1 for t in tables_out if t["page"] == sno),
            "text_chars": slide_chars, "hidden": root.get("show") == "0",
        })

    # A 16:9 deck built on a 4:3 master keeps its placeholders in the left three quarters: centred titles then sit off-centre.
    for m_ in masters_out:
        boxes = [p_["bbox"] for p_ in m_["placeholders"] if p_["bbox"] and p_["type"] in ("title", "body")]
        if boxes and max(b[0] + b[2] for b in boxes) < 0.8:
            warnings.append("The master's title and body placeholders end at about {:.0%} of the slide width: the deck was probably widened from 4:3 without re-fitting the master. "
                            "Text that looks off-centre in the page images is an accident of that, not a brand choice.".format(max(b[0] + b[2] for b in boxes)))
    for lo in layouts_out:
        lo["used_by"] = layout_info[lo["part"]]["used_by"]
    layouts_out.sort(key=lambda l: -len(l["used_by"]))

    # ---- big numbers: numeric runs that are much larger than the body size
    size_chars: Counter = Counter()
    for (fam, bold, size, col), st in text_styles.items():
        size_chars[size] += st["chars"]
    body_size = size_chars.most_common(1)[0][0] if size_chars else 18.0
    big_numbers = []
    for b in big_candidates:
        if b["size_pt"] >= max(1.8 * body_size, 40):
            b["size_canvas_px"] = round(b["size_pt"] * to_canvas, 1)
            pg = pages[b["page"] - 1]
            if b["bbox"]:
                under = [t for t in pg["text_blocks"] if t["bbox"] and t["text"] != b["text"] and t["size_pt"] < b["size_pt"] * 0.6
                         and 0 <= t["bbox"][1] - b["bbox"][1] <= 0.35 and abs(t["bbox"][0] - b["bbox"][0]) < 0.05]
                if under:
                    u = min(under, key=lambda t: t["bbox"][1])
                    b["label"] = {"text": u["text"][:60], "family": u["family"], "bold": u["bold"], "size_canvas_px": u["size_canvas_px"], "color": u["color"], "position": "below"}
            big_numbers.append(b)
    for pg in pages:
        hints = []
        if pg["charts"]:
            hints.append("chart")
        if pg["tables"]:
            hints.append("table")
        nb_ = sum(1 for b in big_numbers if b["page"] == pg["index"])
        if nb_ >= 2:
            hints.append("stats")
        elif nb_ == 1:
            hints.append("big-number")
        if pg["text_blocks"] and pg["text_blocks"][0]["text"][:1] in "“\"‘«":
            hints.append("quote")
        pg["layout_hints"] = hints

    # ---- media
    media_dir = out / "assets/media"
    assets_images = []
    n_slides = len(slide_parts)
    media_written = 0
    for name in sorted(pkg.names):
        if not name.startswith("ppt/media/") or name.endswith("/"):
            continue
        # The entry's own name is used only when it is a plain file name with a known media extension.
        file_name = F.safe_file_name(name[len("ppt/media/"):], "") if "/" not in name[len("ppt/media/"):] else ""
        if not file_name or file_name.rsplit(".", 1)[-1].lower() not in F.MEDIA_EXTENSIONS:
            warnings.append(f"media entry skipped (not a plain image file name): {name[:80]!r}")
            continue
        if media_written >= F.MAX_MEDIA_FILES:
            warnings.append(f"Only the first {F.MAX_MEDIA_FILES} media files were written.")
            break
        try:
            payload = pkg.zip.read(name, F.MAX_MEDIA_BYTES)
        except F.Refused as exc:
            warnings.append(f"media entry skipped: {exc}")
            continue
        media_dir.mkdir(parents=True, exist_ok=True)
        dest = media_dir / file_name
        dest.write_bytes(payload)
        media_written += 1
        ref = media_refs.get(name, {"slides": [], "layouts": [], "masters": [], "placements": []})
        entry = {"file": str(dest.relative_to(out)), "source_part": name, "bytes": dest.stat().st_size, "format": dest.suffix.lstrip(".").lower(),
                 "on_masters": sorted(set(ref["masters"])), "on_layouts": sorted(set(ref["layouts"])), "on_slides": sorted(set(ref["slides"])),
                 "placements": ref["placements"][:6]}
        try:
            from PIL import Image  # noqa: PLC0415

            with Image.open(dest) as im:
                entry["width"], entry["height"] = im.size
        except Exception:  # noqa: BLE001
            pass
        boxes = [p["bbox"] for p in ref["placements"] if p.get("bbox")]
        small = bool(boxes) and max(b[2] * b[3] for b in boxes) < 0.06
        repeated = len(set(ref["slides"])) >= max(3, 0.4 * n_slides)
        named = any(re.search(r"logo|brand|wordmark", (p.get("name") or "") + (p.get("alt") or ""), re.I) for p in ref["placements"])
        score = (0.5 if ref["masters"] or ref["layouts"] else 0) + (0.3 if repeated else 0) + (0.2 if small else 0) + (0.3 if named else 0) + (0.1 if entry["format"] in ("svg", "emf", "wmf") else 0)
        entry["logo_candidate_score"] = round(min(score, 1.0), 2)
        if entry["format"] in ("emf", "wmf"):
            entry["note"] = "Vector metafile: convert with LibreOffice or Inkscape (soffice --convert-to svg) before use."
        assets_images.append(entry)
    assets_images.sort(key=lambda e: -e["logo_candidate_score"])
    embedded_fonts = sorted(n for n in pkg.names if n.startswith("ppt/fonts/"))
    if embedded_fonts:
        warnings.append(f"The deck embeds {len(embedded_fonts)} font files (ppt/fonts/*.fntdata, obfuscated). They are licensed for this document only; do not extract them for reuse.")

    # ---- render
    images: list[Path] = []
    if not args.no_render and args.renderer != "none":
        images = render(args.pptx, out, args.renderer, args.soffice, args.pdf, args.render_width, warnings)
        visible = [p for p in pages if not p["hidden"]]
        target = visible if len(images) == len(visible) else pages
        if images and len(images) != len(target):
            warnings.append(f"{len(images)} page images for {len(pages)} slides: the image numbering may not match slide numbers.")
        for pg, img in zip(target, images):
            pg["image"] = str(img.relative_to(out))
            try:
                pg["palette"] = C.image_palette(img, 8)
                pg["background"]["pixels"] = C.analyze_background(img)
            except Exception as exc:  # noqa: BLE001
                warnings.append(f"page {pg['index']}: image analysis failed ({exc})")
        if images:
            C.contact_sheet(images, out / "pages/contact-sheet.png", labels=[f"{p['index']}: {p['layout']['name'] or ''} {','.join(p['layout_hints'])}" for p in target[: len(images)]])
    else:
        warnings.append("Rendering was skipped: there are no page images to look at.")

    # ---- font availability (matters for render fidelity)
    installed = None
    if shutil.which("fc-list"):
        try:
            fam_out = subprocess.run(["fc-list", ":", "family"], capture_output=True, text=True, timeout=30).stdout.lower()
            installed = lambda fam: fam.lower() in fam_out  # noqa: E731
        except Exception:  # noqa: BLE001
            installed = None

    # ---- assemble
    declared_colors = [{"name": k, "hex": C.norm_hex(v), "origin": f"theme:{k}"} for k, v in theme_colors.items()]
    used_refs = {r for u in color_uses.values() for r in u["refs"]}
    for c in charts_out:
        for s in c["series"]:
            if s.get("color_ref"):
                used_refs.add(s["color_ref"])
            if s.get("color_source", "").startswith("theme-order:accent"):
                used_refs.add(s["color_source"].split(":")[1])
    used_hexes = {h for h, u in color_uses.items()} | {sc for c in charts_out for sc in c.get("series_colors", []) if sc}
    for dc in declared_colors:
        dc["used"] = dc["name"] in used_refs or (dc["name"].startswith("accent") and dc["hex"] in used_hexes)
    declared_fonts = [{"role": k, "family": v, "origin": f"theme:{k}Font"} for k, v in theme_fonts.items()]
    if declared_colors and not any(dc["used"] for dc in declared_colors if dc["name"].startswith("accent")):
        warnings.append("No slide references a theme accent colour. The theme is probably a leftover default: build the palette from observed usage and the page images.")
    theme_font_chars = sum(fu["chars"] for fam, fu in font_uses.items() if fam in theme_fonts.values())
    if total_chars and theme_font_chars / total_chars < 0.3:
        warnings.append("Most text overrides the theme fonts. Take the families from observed.fonts, not from the theme.")

    observed_colors = []
    for hx, u in color_uses.items():
        uses = {k: round(u[k], 4) for k in ("text", "fill", "stroke", "background") if u[k]}
        weight = u["text"] / max(total_chars, 1) + u["fill"] / max(n_slides, 1) + u["background"] / max(n_slides, 1) + 0.05 * u["stroke"] / max(n_slides, 1)
        observed_colors.append({"hex": hx, "weight": round(weight, 4), "page_share": round(len(u["pages"]) / max(n_slides, 1), 2), "uses": uses, "pages": sorted(u["pages"]), "theme_refs": sorted(u["refs"]),
                                "hard_coded_uses": u["explicit"], "in_theme": hx in {d["hex"] for d in declared_colors}})
    observed_colors.sort(key=lambda c: -c["weight"])

    fonts_out = []
    for fam, fu in sorted(font_uses.items(), key=lambda kv: -kv[1]["chars"]):
        entry = {"family": fam, "chars": fu["chars"], "share": round(fu["chars"] / max(total_chars, 1), 3), "bold_share": round(fu["bold_chars"] / max(fu["chars"], 1), 2),
                 "via_theme_share": round(fu["via_theme"] / max(fu["chars"], 1), 2),
                 "theme_role": next((k for k, v in theme_fonts.items() if v == fam), None),
                 "sizes_pt": [{"size": s, "canvas_px": round(s * to_canvas, 1), "chars": c} for s, c in fu["sizes"].most_common(8)],
                 "pages": sorted(fu["pages"]), "subset": False, "embedded": False}
        if installed:
            entry["installed_on_this_machine"] = installed(fam)
        fonts_out.append(entry)
    missing = [f["family"] for f in fonts_out if f.get("installed_on_this_machine") is False]
    if missing and images:
        if args.pdf:
            warnings.append("Fonts not installed on this machine: " + ", ".join(missing) + ". The page images come from the PDF you passed: if the authoring app (PowerPoint, Keynote, Google Slides) exported it, "
                            "the fonts in it are real; if LibreOffice made it, they are substitutes. `pdffonts source.pdf` tells you which.")
        else:
            warnings.append("Fonts not installed here, so the page images show substitutes: " + ", ".join(missing) + ". Judge colour and layout from the images, not letterforms or line breaks.")

    styles_out = []
    for (fam, bold, size, col), st in sorted(text_styles.items(), key=lambda kv: -kv[1]["chars"]):
        styles_out.append({"family": fam, "bold": bold, "size_pt": size, "size_canvas_px": round(size * to_canvas, 1), "color": col, "chars": st["chars"],
                           "pages": sorted(st["pages"]), "sample": st["sample"], "placeholders": dict(st["placeholder"]), "caps": st["caps"], "tracking_pt": st["tracking_pt"]})

    grads_out: dict[tuple, dict] = {}
    for g in gradients:
        key = (g["type"], g.get("css_angle_deg"), tuple((s.get("hex"), s["pos"]) for s in g["stops"]))
        e = grads_out.setdefault(key, {k: v for k, v in g.items() if k not in ("where", "kind")} | {"where": []})
        e["where"].append(g["where"])
    for lo in layouts_out:
        if lo["background"] and lo["background"].get("kind") == "gradient":
            for e in grads_out.values():
                if any(w == f"layout:{lo['name']}" for w in e["where"]):
                    e.setdefault("pages", []).extend(lo["used_by"])

    data = {
        "source": {"type": args.source_type, "path": str(args.pptx.resolve()), "page_count": n_slides,
                   "page_size": {"width": SW, "height": SH, "unit": "emu", "width_pt": SW / 12700, "height_pt": SH / 12700}, "aspect": round(SW / SH, 4),
                   "canvas_scale": {"note": "size_canvas_px = size_pt * 1080 / slide height in pt", "factor": round(to_canvas, 4)},
                   "theme_names": scheme_names, "office_default_theme": bool(office_default)},
        "tool": {"script": "extract_pptx.py"},
        "declared": {"colors": declared_colors, "fonts": declared_fonts,
                     # One entry per slide master. More than one distinct theme means the deck has a master per surface:
                     # read each as that surface's roles (dk1/lt1 text and background, accent1 the accent there).
                     "themes": list(master_themes.values())},
        "observed": {"colors": observed_colors[:60], "fonts": fonts_out, "text_styles": styles_out[:40], "body_size_pt": body_size,
                     "gradients": list(grads_out.values()),
                     "shapes": {"corner_radii_canvas_px": [{"radius": k, "count": v} for k, v in radii.most_common(8)],
                                "strokes": [{"hex": k[0], "width_pt": k[1], "count": v} for k, v in strokes.most_common(8)]}},
        "pages": pages,
        "masters": masters_out,
        "layouts": layouts_out,
        "assets": {"images": assets_images, "embedded_fonts": embedded_fonts,
                   "contact_sheet": "pages/contact-sheet.png" if images else None, "source_pdf": "source.pdf" if (out / "source.pdf").exists() else None},
        "dataviz": {"charts": charts_out, "tables": tables_out, "big_numbers": big_numbers},
        "warnings": warnings,
    }
    path = C.write_extraction(out, data)
    print(C.summarize(data))
    print("layouts used:", ", ".join(f"{l['name']}×{len(l['used_by'])}" for l in layouts_out if l["used_by"]))
    print("wrote", path)


if __name__ == "__main__":
    try:
        main()
    except F.Refused as exc:
        sys.exit(f"Refused: {exc}. Nothing more was read from this file.")
