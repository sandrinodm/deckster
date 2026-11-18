"""The layout probe: a copy of a template with one slide per slide layout, so a renderer draws every
layout, and the SVG clean-up that turns a rendered page into a layout's artwork.

Standard library only. The probe is built from the package that `extract_pptx.offline_copy` already
neutralised (no external references, no embedded objects, no macros), so the renderer never opens the
original. Three decisions come from the Phase 0 spikes:

- A template (.potx, .potm) or a macro-enabled deck (.pptm) is rewritten to a plain presentation by
  the content type of `/ppt/presentation.xml`; the VBA project is dropped, never read.
- The art probe's slides hold no shapes at all, so a slide shows its layout and master decoration and
  nothing else. (Empty placeholders would draw "Click icon to add picture" for a picture placeholder.)
  A placeholder nested in a group on a layout is not cloned onto slides, and LibreOffice draws it as an
  ordinary shape, so the probe removes those from its copy of the layouts.
- A slide-level `noFill` background is ignored by LibreOffice, so the art keeps the page's background
  and `strip_svg` removes the leading full-page rectangles instead. The last one removed is the
  layout's effective background colour.
"""
from __future__ import annotations

import io
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

PML = "http://schemas.openxmlformats.org/presentationml/2006/main"
DML = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"

PRESENTATION_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
SLIDE_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"
HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

# Placeholder types that are chrome: brand chrome draws these, so a probe never fills them.
CHROME_TYPES = {"sldNum", "dt", "ftr"}
# Placeholder types a probe slide cannot fill with text.
NON_TEXT_TYPES = {"pic", "chart", "tbl", "dgm", "media", "clipArt", "obj_graphic"}

SAMPLE_TEXT = {"title": "Slide title", "ctrTitle": "Slide title", "subTitle": "Subtitle text"}

# The SVG elements that draw something.
DRAWING_TAGS = {"path", "use", "image", "rect", "circle", "ellipse", "line", "polygon", "polyline", "text"}
HIDDEN_PARENTS = {"defs", "clipPath", "symbol", "mask", "pattern", "marker"}


# A slide layout part the probe may point a slide at. The name comes from the template's zip, so
# anything else (a quote, a path) is refused rather than written into the probe's XML.
LAYOUT_PART = re.compile(r"ppt/slideLayouts/[A-Za-z0-9_-]+\.xml")


class ProbeError(Exception):
    """A package the probe cannot be built from."""


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


# ---------------------------------------------------------------------------- package to presentation


def to_presentation(src: Path, dst: Path) -> list[str]:
    """Writes a copy of `src` whose main part is a plain presentation, without macros, and returns notes.

    The content type is rewritten by the part name `/ppt/presentation.xml`, whatever it declared
    (template, macro-enabled, macro-enabled template). A VBA project part, and the relationship that
    names it, are removed: macros are never read and never reach the renderer."""
    notes: list[str] = []
    with zipfile.ZipFile(src) as zin:
        parts = {info.filename: zin.read(info.filename) for info in zin.infolist() if not info.filename.endswith("/")}
    ct_name = "[Content_Types].xml"
    if ct_name not in parts or "ppt/presentation.xml" not in parts:
        raise ProbeError("not a presentation package: [Content_Types].xml or ppt/presentation.xml is missing")
    vba = {name for name in parts if posixpath.basename(name).lower().startswith("vbaproject")}
    root = ET.fromstring(parts[ct_name])
    for el in list(root):
        part = (el.get("PartName") or "").lstrip("/")
        if _local(el.tag) == "Override":
            if part == "ppt/presentation.xml":
                if el.get("ContentType") != PRESENTATION_TYPE:
                    notes.append(f"main part type {el.get('ContentType')} rewritten to a presentation")
                el.set("ContentType", PRESENTATION_TYPE)
            elif part in vba:
                root.remove(el)
    ET.register_namespace("", CT_NS)
    parts[ct_name] = ET.tostring(root, encoding="UTF-8", xml_declaration=True)
    for name in vba:
        del parts[name]
        notes.append("VBA project dropped (never read)")
    for name in [n for n in parts if n.endswith(".rels")]:
        rels = ET.fromstring(parts[name])
        dropped = [r for r in rels if r.get("Type", "").rsplit("/", 1)[-1].lower() == "vbaproject"]
        for r in dropped:
            rels.remove(r)
        if dropped:
            ET.register_namespace("", REL_NS)
            parts[name] = ET.tostring(rels, encoding="UTF-8", xml_declaration=True)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, data in parts.items():
            zout.writestr(name, data)
    return notes


# ---------------------------------------------------------------------------- the probe


def _register_namespaces(data: bytes) -> None:
    for _, (prefix, uri) in ET.iterparse(io.BytesIO(data), events=("start-ns",)):
        try:
            ET.register_namespace(prefix, uri)
        except ValueError:  # a reserved prefix such as ns0: ElementTree picks its own
            pass


def remove_group_placeholders(data: bytes) -> tuple[bytes, int]:
    """The layout XML without placeholders nested in a group. Returns the bytes and how many were removed;
    the part is returned untouched when there are none, so ElementTree re-serialises only what it must."""
    root = ET.fromstring(data)
    parents = {child: parent for parent in root.iter() for child in parent}
    doomed = []
    for group in root.iter(f"{{{PML}}}grpSp"):
        for el in group.iter():
            if _local(el.tag) in ("sp", "pic", "graphicFrame") and el.find(f".//{{{PML}}}nvPr/{{{PML}}}ph") is not None:
                doomed.append(el)
    for el in doomed:
        if el in parents:
            parents[el].remove(el)
    if not doomed:
        return data, 0
    _register_namespaces(data)
    for key in [k for k in root.attrib if k == f"{{{MC_NS}}}Ignorable"]:
        del root.attrib[key]  # it names prefixes ElementTree may drop as unused
    return ET.tostring(root, encoding="UTF-8", xml_declaration=True), len(doomed)


def _attr(value) -> str:
    return escape(str(value), {'"': "&quot;"})


def _placeholder_xml(shape_id: int, ph: dict, text: str | None) -> str:
    attrs = ""
    if ph.get("type_declared"):
        attrs += f' type="{_attr(ph["type_declared"])}"'
    if ph.get("idx_declared") is not None:
        attrs += f' idx="{_attr(ph["idx_declared"])}"'
    for key in ("sz", "orient"):
        if ph.get(key):
            attrs += f' {key}="{_attr(ph[key])}"'
    name = _attr(f"{ph.get('name') or 'Placeholder'} {shape_id}")
    body = ""
    if text is not None:
        paras = "".join(
            f'<a:p><a:pPr lvl="{lvl}"/><a:r><a:rPr lang="en-US"/><a:t>{escape(line)}</a:t></a:r></a:p>' if lvl else f'<a:p><a:r><a:rPr lang="en-US"/><a:t>{escape(line)}</a:t></a:r></a:p>'
            for lvl, line in enumerate(text.split("\n"))
        )
        body = f"<p:txBody><a:bodyPr/><a:lstStyle/>{paras}</p:txBody>"
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{shape_id}" name="{name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
            f"<p:nvPr><p:ph{attrs}/></p:nvPr></p:nvSpPr><p:spPr/>{body}</p:sp>")


def sample_text(ph: dict) -> str | None:
    """What a filled reference slide puts in a placeholder: the template's own prompt when it wrote one,
    else sample text by kind. None for a placeholder that takes no text (picture, chart, table)."""
    kind = ph.get("type")
    if kind in NON_TEXT_TYPES:
        return None
    if ph.get("has_custom_prompt") and ph.get("prompt"):
        return ph["prompt"][:200]
    if kind in SAMPLE_TEXT:
        return SAMPLE_TEXT[kind]
    return "First level\nSecond level"


def _slide_xml(layout: dict, variant: str) -> str:
    shapes = ""
    if variant == "filled":
        n = 1
        for ph in layout.get("placeholders", []):
            if ph.get("in_group") or ph.get("type") in CHROME_TYPES:
                continue
            n += 1
            shapes += _placeholder_xml(n, ph, sample_text(ph))
    tree = ('<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
            f"{shapes}</p:spTree>")
    return (HEADER + f'<p:sld xmlns:a="{DML}" xmlns:r="{OFFICE_REL}" xmlns:p="{PML}"><p:cSld>{tree}</p:cSld>'
            "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>")


def build_probe(src: Path, dst: Path, layouts: list[dict], variant: str = "art") -> dict:
    """Writes `dst`: the presentation `src` with its slides replaced by one slide per layout, in `layouts`
    order. `variant` is `art` (slides with no shapes) or `filled` (placeholders with prompt or sample text,
    the reference render). Each layout dict needs `part` and, for `filled`, `placeholders`.

    Returns {"slides": n, "group_placeholders_removed": n}. `src` must already be a plain presentation
    (`to_presentation`) built from the neutralised copy."""
    for layout in layouts:
        if not LAYOUT_PART.fullmatch(str(layout["part"])):
            raise ProbeError(f"layout part {layout['part']!r} is not a slide layout part name")
    with zipfile.ZipFile(src) as zin:
        parts = {info.filename: zin.read(info.filename) for info in zin.infolist() if not info.filename.endswith("/")}
    removed = 0
    for layout in layouts:
        data = parts.get(layout["part"])
        if data is None:
            raise ProbeError(f"layout part {layout['part']} is missing from the package")
        parts[layout["part"]], count = remove_group_placeholders(data)
        removed += count

    # drop the template's own slides: the probe has exactly one slide per layout
    for name in [n for n in parts if n.startswith(("ppt/slides/", "ppt/notesSlides/", "ppt/comments/"))]:
        del parts[name]
    pres_rels_name = "ppt/_rels/presentation.xml.rels"
    rels = ET.fromstring(parts[pres_rels_name])
    for rel in list(rels):
        if rel.get("Type", "").rsplit("/", 1)[-1] in ("slide", "notesSlide"):
            rels.remove(rel)
    ct = ET.fromstring(parts["[Content_Types].xml"])
    for el in list(ct):
        part = (el.get("PartName") or "").lstrip("/")
        if part.startswith(("ppt/slides/", "ppt/notesSlides/", "ppt/comments/")):
            ct.remove(el)

    ids = []
    for index, layout in enumerate(layouts, 1):
        slide = f"ppt/slides/slide{index}.xml"
        parts[slide] = _slide_xml(layout, variant).encode("utf-8")
        parts[f"ppt/slides/_rels/slide{index}.xml.rels"] = (
            HEADER + f'<Relationships xmlns="{REL_NS}"><Relationship Id="rId1" Type="{OFFICE_REL}/slideLayout" '
            f'Target="../slideLayouts/{_attr(posixpath.basename(layout["part"]))}"/></Relationships>').encode("utf-8")
        ET.SubElement(rels, f"{{{REL_NS}}}Relationship", {"Id": f"rIdProbe{index}", "Type": f"{OFFICE_REL}/slide", "Target": f"slides/slide{index}.xml"})
        ET.SubElement(ct, f"{{{CT_NS}}}Override", {"PartName": f"/{slide}", "ContentType": SLIDE_TYPE})
        ids.append((256 + index, f"rIdProbe{index}"))
    ET.register_namespace("", REL_NS)
    parts[pres_rels_name] = ET.tostring(rels, encoding="UTF-8", xml_declaration=True)
    ET.register_namespace("", CT_NS)
    parts["[Content_Types].xml"] = ET.tostring(ct, encoding="UTF-8", xml_declaration=True)

    text = parts["ppt/presentation.xml"].decode("utf-8")
    pfx = re.search(r"<(\w+):presentation\b", text)
    p = pfx.group(1) if pfx else "p"
    rpfx = re.search(rf'xmlns:(\w+)="{re.escape(OFFICE_REL)}"', text)
    r = rpfx.group(1) if rpfx else "r"
    text = re.sub(rf"<{p}:sldIdLst\s*/>|<{p}:sldIdLst>.*?</{p}:sldIdLst>", "", text, flags=re.S)
    text = re.sub(rf"<{p}:custShowLst>.*?</{p}:custShowLst>", "", text, flags=re.S)
    id_list = f"<{p}:sldIdLst>" + "".join(f'<{p}:sldId id="{i}" {r}:id="{rid}"/>' for i, rid in ids) + f"</{p}:sldIdLst>"
    if f"<{p}:sldSz" not in text:
        raise ProbeError("ppt/presentation.xml has no slide size")
    text = text.replace(f"<{p}:sldSz", id_list + f"<{p}:sldSz", 1)
    parts["ppt/presentation.xml"] = text.encode("utf-8")
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("[Content_Types].xml", parts.pop("[Content_Types].xml"))
        for name, data in parts.items():
            zout.writestr(name, data)
    return {"slides": len(layouts), "group_placeholders_removed": removed}


# ---------------------------------------------------------------------------- SVG art


def _page_size(root: ET.Element) -> tuple[float, float]:
    box = (root.get("viewBox") or "").replace(",", " ").split()
    if len(box) == 4:
        return float(box[2]), float(box[3])
    return float(re.sub(r"[a-z%]+$", "", root.get("width", "0"))), float(re.sub(r"[a-z%]+$", "", root.get("height", "0")))


def _rect_box(d: str) -> tuple[float, float, float, float] | None:
    """The bounding box of a path that is one axis-aligned rectangle, else None."""
    cmds = re.findall(r"[MLHVZmlhvzCcSsQqTtAa]", d)
    if any(c not in "MLZ" for c in cmds):
        return None
    nums = [float(x) for x in re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", d)]
    if len(nums) < 8 or len(nums) % 2:
        return None
    xs, ys = nums[0::2], nums[1::2]
    if len({round(x, 1) for x in xs}) > 2 or len({round(y, 1) for y in ys}) > 2:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _hex_of(fill: str) -> str | None:
    fill = (fill or "").strip()
    if fill.startswith("#") and len(fill) == 7:
        return fill.upper()
    m = re.fullmatch(r"rgb\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)", fill)
    if m:
        return "#" + "".join(f"{round(float(v) * 2.55):02X}" for v in m.groups())
    m = re.fullmatch(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", fill)
    if m:
        return "#" + "".join(f"{int(v):02X}" for v in m.groups())
    return None


def strip_svg(src: Path, dst: Path, tolerance: float = 1.5) -> dict:
    """Writes the pdftocairo SVG `src` to `dst` without its leading full-page rectangles.

    Walks the drawing in z-order and removes each filled, unstroked path or rect that is one axis-aligned
    rectangle covering the page, stopping at the first drawn element that is not one. Returns
    {"background": hex of the last removed rectangle (the layout's effective background) or None,
    "removed": n, "has_art": whether anything is drawn after the strip, "width": w, "height": h,
    "page_fill": "gradient" or "picture" when the page is filled by one (kept as art, not stripped), else None}.
    A layout whose decoration is itself a full-page rectangle at the bottom is indistinguishable from
    the background; it is stripped and reported as the background colour."""
    for prefix, uri in (("", SVG_NS), ("xlink", XLINK_NS)):
        ET.register_namespace(prefix, uri)
    tree = ET.parse(src)
    root = tree.getroot()
    width, height = _page_size(root)
    removed: list[str] = []
    page_fill: list[str] = []
    stop = False

    def walk(node: ET.Element, hidden: bool) -> None:
        nonlocal stop
        for child in list(node):
            if stop:
                return
            tag = _local(child.tag)
            if tag in HIDDEN_PARENTS:
                continue
            if tag == "path" and not hidden:
                box = _rect_box(child.get("d", ""))
                full = box is not None and box[0] <= tolerance and box[1] <= tolerance + 0.5 and box[2] >= width - tolerance and box[3] >= height - tolerance
                if full and child.get("fill") and not child.get("stroke") and not child.get("fill", "").startswith("url("):
                    removed.append(child.get("fill", ""))
                    node.remove(child)
                    continue
                if full and child.get("fill", "").startswith("url("):
                    page_fill.append("gradient")  # a gradient or pattern page fill is art, not a plain background
                stop = True
                return
            if tag == "rect" and not hidden:
                # newer LibreOffice and poppler write a page background as <rect>, often larger than the page
                try:
                    rx, ry = float(child.get("x", 0)), float(child.get("y", 0))
                    rw, rh = float(child.get("width", 0)), float(child.get("height", 0))
                except ValueError:
                    rx = ry = rw = rh = 0.0
                if rx <= tolerance and ry <= tolerance and rx + rw >= width - tolerance and ry + rh >= height - tolerance and child.get("fill") and not child.get("stroke"):
                    removed.append(child.get("fill", ""))
                    node.remove(child)
                    continue
            if tag in DRAWING_TAGS:
                if tag == "image":
                    try:
                        iw, ih = float(re.sub(r"[a-z%]+$", "", child.get("width", "0"))), float(re.sub(r"[a-z%]+$", "", child.get("height", "0")))
                    except ValueError:
                        iw = ih = 0.0
                    if iw * ih >= 0.8 * width * height:
                        page_fill.append("picture")  # a photo background
                stop = True
                return
            walk(child, hidden)

    walk(root, False)
    drawn = 0

    def count(node: ET.Element) -> None:
        nonlocal drawn
        for child in node:
            tag = _local(child.tag)
            if tag in HIDDEN_PARENTS:
                continue
            if tag in DRAWING_TAGS:
                drawn += 1
            count(child)

    count(root)
    tree.write(dst, encoding="utf-8", xml_declaration=True)
    return {"background": _hex_of(removed[-1]) if removed else None, "removed": len(removed), "has_art": drawn > 0,
            "width": width, "height": height, "page_fill": page_fill[0] if page_fill else None}


def add_background(src: Path, dst: Path, color: str) -> None:
    """Writes `dst`: the stripped art `src` with a full-page rectangle of `color` as its first drawing, so a layout
    whose own background is not any brand surface's keeps it."""
    for prefix, uri in (("", SVG_NS), ("xlink", XLINK_NS)):
        ET.register_namespace(prefix, uri)
    tree = ET.parse(src)
    root = tree.getroot()
    width, height = _page_size(root)
    rect = ET.Element(f"{{{SVG_NS}}}rect", {"x": "0", "y": "0", "width": f"{width:g}", "height": f"{height:g}", "fill": color})
    index = 1 if root.find(f"{{{SVG_NS}}}defs") is not None else 0
    root.insert(index, rect)
    tree.write(dst, encoding="utf-8", xml_declaration=True)
