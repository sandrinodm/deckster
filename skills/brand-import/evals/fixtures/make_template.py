"""The layout fixture of the brand-import evals and tests: a template built from raw OOXML (python-pptx cannot
make two slide masters), standard library only.

Two slide masters, 13 layouts, no slides:
  Daylight (light, DejaVu Sans): Title Slide, Title and Content, Two Content, Section Header (own dark
    background and an inverting colour-map override), Picture with Caption (a `pic` placeholder),
    Decorated Confidential (strip, band, rule, a group, fixed text), Key Takeaway (two custom prompts),
    Grouped Body (a body placeholder inside a group), Title Only.
  Nightfall (dark colour map, fonts Zephyrine Display/Text that no machine has): Title Slide, Title and
    Content, Section Header (the same names as Daylight's three), Blank.
Same-named layouts on both masters: Title Slide, Title and Content (same geometry), Section Header
(different geometry). Every layout is unused, as in any slideless template.

  python3 -I make_template.py <outdir>
Writes template.pptx, template.potx, template-4x3.pptx, template-4x3.potx and template-deckster.pptx (the
same package with the app.xml the deckster export writes). The .potx is made as PowerPoint does: save the
.pptx, rewrite the main part's content type, rename.
"""
import sys
import zipfile
from pathlib import Path

NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CT_PRES = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
CT_POTX = "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml"
H = 6858000

_id = [1]


def nid():
    _id[0] += 1
    return _id[0]


def xfrm(x, y, w, h, W, tag="a:xfrm"):
    return f'<{tag}><a:off x="{int(x * W)}" y="{int(y * H)}"/><a:ext cx="{int(w * W)}" cy="{int(h * H)}"/></{tag}>'


def ph(type_, idx, box, W, text="Click to edit Master text styles", name=None, custom=False, extra="", sz=None, algn=None, anchor=None):
    t = f' type="{type_}"' if type_ else ""
    i = f' idx="{idx}"' if idx is not None else ""
    hc = ' hasCustomPrompt="1"' if custom else ""
    nm = name or f"{type_ or 'Content'} Placeholder {idx}"
    sp = xfrm(*box, W) if box else ""
    body_pr = f'<a:bodyPr anchor="{anchor}"/>' if anchor else "<a:bodyPr/>"
    rpr = '<a:rPr lang="en-US"/>'
    ppr = ""
    # size and alignment belong in the placeholder's list style, where PowerPoint writes them
    lst = "<a:lstStyle/>"
    if sz or algn:
        lst = ("<a:lstStyle><a:lvl1pPr" + (f' algn="{algn}"' if algn else "") + ">" + (f'<a:defRPr sz="{sz}"/>' if sz else "") + "</a:lvl1pPr></a:lstStyle>")
    if type_ == "pic":
        text = "Click icon to add picture"
    if type_ == "sldNum":
        para = f'<a:p><a:fld id="{{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>'
    elif type_ == "dt":
        para = f'<a:p><a:fld id="{{A1F15528-21DE-4FAA-801E-634DDDAF4B2B}}" type="datetimeFigureOut"><a:rPr lang="en-US"/><a:t>11/18/2026</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>'
    elif type_ == "ftr":
        para = '<a:p><a:endParaRPr lang="en-US"/></a:p>'
    else:
        para = f'<a:p>{ppr}<a:r>{rpr}<a:t>{text}</a:t></a:r></a:p>'
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{nid()}" name="{nm}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
            f'<p:nvPr><p:ph{t}{i}{hc}{extra}/></p:nvPr></p:nvSpPr><p:spPr>{sp}</p:spPr>'
            f'<p:txBody>{body_pr}{lst}{para}</p:txBody></p:sp>')


def rect(name, box, W, fill, prst="rect", line=None, text=None, font_sz=1400, color="bg1", rot=0, geom_extra=""):
    ln = f'<a:ln w="19050"><a:solidFill>{line}</a:solidFill></a:ln>' if line else "<a:ln><a:noFill/></a:ln>"
    tb = ""
    if text is not None:
        tb = (f'<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="l"/><a:r>'
              f'<a:rPr lang="en-US" sz="{font_sz}" b="1"><a:solidFill><a:schemeClr val="{color}"/></a:solidFill></a:rPr><a:t>{text}</a:t></a:r></a:p></p:txBody>')
    r = f' rot="{rot}"' if rot else ""
    xf = xfrm(*box, W).replace("<a:xfrm>", f"<a:xfrm{r}>")
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{nid()}" name="{name}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr>'
            f'<p:spPr>{xf}<a:prstGeom prst="{prst}"><a:avLst/></a:prstGeom>{fill}{ln}</p:spPr>{tb}</p:sp>')


def solid(clr):
    return f'<a:solidFill><a:schemeClr val="{clr}"/></a:solidFill>' if len(clr) < 7 or not clr[0] in "0123456789ABCDEF" or clr in ("bg1", "tx1", "bg2", "tx2") or clr.startswith("accent") else f'<a:solidFill><a:srgbClr val="{clr}"/></a:solidFill>'


def srgb(h):
    return f'<a:solidFill><a:srgbClr val="{h}"/></a:solidFill>'


def line(name, x1, y1, x2, y2, W, clr="accent2"):
    return (f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{nid()}" name="{name}"/><p:cNvCxnSpPr/><p:nvPr userDrawn="1"/></p:nvCxnSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{int(x1 * W)}" y="{int(y1 * H)}"/><a:ext cx="{int((x2 - x1) * W)}" cy="{int((y2 - y1) * H)}"/></a:xfrm>'
            f'<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="28575"><a:solidFill><a:schemeClr val="{clr}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>')


def group(name, box, W, children):
    x, y, w, h = box
    X, Y, CW, CH = int(x * W), int(y * H), int(w * W), int(h * H)
    return (f'<p:grpSp><p:nvGrpSpPr><p:cNvPr id="{nid()}" name="{name}"/><p:cNvGrpSpPr/><p:nvPr userDrawn="1"/></p:nvGrpSpPr>'
            f'<p:grpSpPr><a:xfrm><a:off x="{X}" y="{Y}"/><a:ext cx="{CW}" cy="{CH}"/><a:chOff x="{X}" y="{Y}"/><a:chExt cx="{CW}" cy="{CH}"/></a:xfrm></p:grpSpPr>'
            f'{"".join(children)}</p:grpSp>')


def sptree(shapes):
    return ('<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
            + "".join(shapes) + "</p:spTree>")


def footers(W, dark=False):
    return [ph("dt", 10, (0.06, 0.92, 0.25, 0.05), W), ph("ftr", 11, (0.36, 0.92, 0.28, 0.05), W), ph("sldNum", 12, (0.78, 0.92, 0.16, 0.05), W)]


def layout_xml(name, type_, shapes, W, bg=None, ovr=None, show_master=True):
    _id[0] = 1
    t = f' type="{type_}"' if type_ else ""
    sm = "" if show_master else ' showMasterSp="0"'
    bgx = f"<p:bg><p:bgPr>{bg}<a:effectLst/></p:bgPr></p:bg>" if bg else ""
    co = ovr or "<a:masterClrMapping/>"
    return (HDR + f'<p:sldLayout {NS}{t} preserve="1"{sm}><p:cSld name="{name}">{bgx}{sptree(shapes)}</p:cSld>'
            f'<p:clrMapOvr>{co}</p:clrMapOvr></p:sldLayout>')


TITLE_BOX = (0.08, 0.06, 0.84, 0.18)
BODY_BOX = (0.08, 0.28, 0.84, 0.58)

INVERT = '<a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'


def layouts_for(W):
    """Returns {master_no: [(name, xml)]}. Layout xml is built lazily with fresh shape ids."""
    L = {1: [], 2: []}

    def add(m, name, type_, shapes_fn, **kw):
        _id[0] = 1
        L[m].append((name, layout_xml(name, type_, shapes_fn(), W, **kw)))

    # ---- master 1 (light)
    add(1, "Title Slide", "title", lambda: [
        ph("ctrTitle", None, (0.1, 0.30, 0.8, 0.22), W, "Click to edit Master title style", sz=5400, algn="ctr", anchor="b"),
        ph("subTitle", 1, (0.1, 0.55, 0.8, 0.12), W, "Click to edit Master subtitle style", algn="ctr"), *footers(W)])
    add(1, "Title and Content", "obj", lambda: [
        ph("title", None, TITLE_BOX, W, "Click to edit Master title style"), ph(None, 1, BODY_BOX, W), *footers(W)])
    add(1, "Two Content", "twoObj", lambda: [
        ph("title", None, TITLE_BOX, W, "Click to edit Master title style"),
        ph(None, 1, (0.08, 0.28, 0.40, 0.58), W, sz=2400), ph(None, 2, (0.52, 0.28, 0.40, 0.58), W, sz=2400), *footers(W)])
    add(1, "Section Header", "secHead", lambda: [
        ph("title", None, (0.08, 0.35, 0.84, 0.2), W, "Click to edit Master title style", sz=4800, anchor="b"),
        ph("body", 1, (0.08, 0.58, 0.84, 0.1), W, "Click to edit Master text styles", sz=2000), *footers(W)],
        bg=srgb("0B2545"), ovr=INVERT)
    add(1, "Picture with Caption", "picTx", lambda: [
        ph("title", None, (0.05, 0.08, 0.32, 0.2), W, "Click to edit Master title style", sz=2800, anchor="b"),
        ph("pic", 1, (0.42, 0.08, 0.53, 0.80), W),
        ph("body", 2, (0.05, 0.30, 0.32, 0.55), W, "Click to edit Master text styles", sz=1600), *footers(W)])
    add(1, "Decorated Confidential", None, lambda: [
        rect("Accent Strip", (0, 0, 0.03, 1), W, solid("accent1")),
        rect("Footer Band", (0, 0.88, 1, 0.12), W, solid("bg2")),
        line("Rule", 0.08, 0.25, 0.92, 0.25, W),
        group("Corner Mark", (0.86, 0.02, 0.12, 0.16), W, [
            rect("Corner Disc", (0.90, 0.02, 0.07, 0.12), W, solid("accent3"), prst="ellipse"),
            rect("Corner Chip", (0.86, 0.12, 0.09, 0.05), W, solid("accent4"), prst="roundRect")]),
        rect("Confidential Stamp", (0.06, 0.90, 0.22, 0.07), W, "<a:noFill/>", text="Confidential", color="tx1", font_sz=1400),
        ph("title", None, (0.08, 0.06, 0.74, 0.17), W, "Click to edit Master title style"),
        ph(None, 1, (0.08, 0.28, 0.84, 0.58), W), *footers(W)])
    add(1, "Key Takeaway", "obj", lambda: [
        ph("title", None, TITLE_BOX, W, "Click to edit Master title style"),
        ph(None, 1, (0.08, 0.28, 0.84, 0.30), W, "Describe the key result in one sentence", custom=True, name="Takeaway Placeholder", sz=3200),
        ph("body", 13, (0.08, 0.62, 0.84, 0.24), W, "Add supporting evidence here", custom=True, name="Evidence Placeholder", sz=1800), *footers(W)])
    add(1, "Grouped Body", "obj", lambda: [
        ph("title", None, TITLE_BOX, W, "Click to edit Master title style"),
        group("Framed Body", (0.08, 0.28, 0.84, 0.58), W, [
            rect("Body Frame", (0.08, 0.28, 0.84, 0.58), W, "<a:noFill/>", line='<a:schemeClr val="accent1"/>'),
            ph(None, 1, (0.10, 0.30, 0.80, 0.54), W)]), *footers(W)])
    add(1, "Title Only", "titleOnly", lambda: [
        ph("title", None, TITLE_BOX, W, "Click to edit Master title style"), *footers(W)])
    # ---- master 2 (dark)
    add(2, "Title Slide", "title", lambda: [
        rect("Dark Glow", (0, 0.72, 1, 0.28), W, solid("accent1")),
        ph("ctrTitle", None, (0.1, 0.25, 0.8, 0.25), W, "Click to edit Master title style", sz=5400, algn="l", anchor="b"),
        ph("subTitle", 1, (0.1, 0.53, 0.8, 0.12), W, "Click to edit Master subtitle style", algn="l"), *footers(W)])
    add(2, "Title and Content", "obj", lambda: [
        rect("Internal Stamp", (0.06, 0.90, 0.40, 0.07), W, "<a:noFill/>", text="Nightfall Internal", color="tx1", font_sz=1800),
        ph("title", None, TITLE_BOX, W, "Click to edit Master title style"), ph(None, 1, BODY_BOX, W), *footers(W)])
    add(2, "Section Header", "secHead", lambda: [
        ph("title", None, (0.20, 0.30, 0.60, 0.2), W, "Click to edit Master title style", sz=4800, anchor="b", algn="ctr"),
        ph("body", 1, (0.20, 0.53, 0.60, 0.1), W, "Click to edit Master text styles", sz=2000, algn="ctr"), *footers(W)])
    add(2, "Blank", "blank", lambda: [*footers(W)])
    return L


def theme_xml(name, clrs, major, minor):
    c = "".join(f'<a:{k}><a:srgbClr val="{v}"/></a:{k}>' for k, v in clrs.items())
    fills = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' * 3
    lns = "".join('<a:ln w="%d" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' % w for w in (6350, 12700, 19050))
    eff = '<a:effectStyle><a:effectLst/></a:effectStyle>' * 3
    return (HDR + f'<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="{name}"><a:themeElements>'
            f'<a:clrScheme name="{name} Colors">{c}</a:clrScheme>'
            f'<a:fontScheme name="{name} Fonts"><a:majorFont><a:latin typeface="{major}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
            f'<a:minorFont><a:latin typeface="{minor}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
            f'<a:fmtScheme name="{name}"><a:fillStyleLst>{fills}</a:fillStyleLst><a:lnStyleLst>{lns}</a:lnStyleLst>'
            f'<a:effectStyleLst>{eff}</a:effectStyleLst><a:bgFillStyleLst>{fills}</a:bgFillStyleLst></a:fmtScheme>'
            f'</a:themeElements></a:theme>')


def lvl(n, sz, marL, bullet=True, bold=False):
    b = '<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>' if bullet else "<a:buNone/>"
    return (f'<a:lvl{n}pPr marL="{marL}" indent="-285750" algn="l"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="600"/></a:spcBef>{b}'
            f'<a:defRPr sz="{sz}" b="{1 if bold else 0}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl{n}pPr>')


def master_xml(dark, W, layout_rids):
    _id[0] = 1
    bg = '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'
    shapes = []
    if dark:
        shapes.append(rect("Dark Edge", (0, 0, 1, 0.012), W, solid("accent2")))
    shapes += [ph("title", None, TITLE_BOX, W, "Click to edit Master title style", name="Title Placeholder 1"),
               ph("body", 1, BODY_BOX, W, "Click to edit Master text styles", name="Text Placeholder 2"), *footers(W)]
    clrmap = ('<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
              if dark else '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>')
    ids = "".join(f'<p:sldLayoutId id="{i}" r:id="{rid}"/>' for i, rid in layout_rids)
    title_style = ('<p:titleStyle><a:lvl1pPr algn="l"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:buNone/>'
                   '<a:defRPr sz="4000" b="1" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>')
    body_style = "<p:bodyStyle>" + "".join(lvl(n, s, m) for n, s, m in [(1, 2800, 342900), (2, 2400, 800100), (3, 2000, 1257300), (4, 1800, 1714500), (5, 1800, 2171700)]) + "</p:bodyStyle>"
    other = f'<p:otherStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle>'
    return (HDR + f'<p:sldMaster {NS}><p:cSld>{bg}{sptree(shapes)}</p:cSld>{clrmap}<p:sldLayoutIdLst>{ids}</p:sldLayoutIdLst>'
            f'<p:txStyles>{title_style}{body_style}{other}</p:txStyles></p:sldMaster>')


LIGHT = dict(dk1="1B1B1F", lt1="FFFFFF", dk2="2A3B4C", lt2="F1ECE1", accent1="D1495B", accent2="00798C", accent3="EDAE49", accent4="30638E", accent5="003D5B", accent6="66A182", hlink="0563C1", folHlink="954F72")
DARK = dict(dk1="0E1116", lt1="F5F5F7", dk2="1F2937", lt2="D6DAE0", accent1="7C3AED", accent2="22D3EE", accent3="F59E0B", accent4="10B981", accent5="EF4444", accent6="64748B", hlink="60A5FA", folHlink="A78BFA")


def build(path, W, main_ct=CT_PRES, application="Microsoft Office PowerPoint", app_version="16.0000"):
    L = layouts_for(W)
    parts = {}
    ct = []
    pres_rels = []
    lay_n = 0
    master_ids = []
    nxt = 2147483648
    for m in (1, 2):
        master_id = nxt
        nxt += 1
        rids, rel_xml = [], [f'<Relationship Id="rIdT" Type="{REL}/theme" Target="../theme/theme{m}.xml"/>']
        for k, (name, xml) in enumerate(L[m], 1):
            lay_n += 1
            parts[f"ppt/slideLayouts/slideLayout{lay_n}.xml"] = xml
            parts[f"ppt/slideLayouts/_rels/slideLayout{lay_n}.xml.rels"] = (
                HDR + f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/slideMaster" Target="../slideMasters/slideMaster{m}.xml"/></Relationships>')
            ct.append((f"/ppt/slideLayouts/slideLayout{lay_n}.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"))
            rids.append((nxt, f"rId{k}"))
            nxt += 1
            rel_xml.append(f'<Relationship Id="rId{k}" Type="{REL}/slideLayout" Target="../slideLayouts/slideLayout{lay_n}.xml"/>')
        parts[f"ppt/slideMasters/slideMaster{m}.xml"] = master_xml(m == 2, W, rids)
        parts[f"ppt/slideMasters/_rels/slideMaster{m}.xml.rels"] = HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(rel_xml) + "</Relationships>"
        parts[f"ppt/theme/theme{m}.xml"] = (theme_xml("Daylight", LIGHT, "DejaVu Sans", "DejaVu Sans") if m == 1 else theme_xml("Nightfall", DARK, "Zephyrine Display", "Zephyrine Text"))
        ct += [(f"/ppt/slideMasters/slideMaster{m}.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"),
               (f"/ppt/theme/theme{m}.xml", "application/vnd.openxmlformats-officedocument.theme+xml")]
        master_ids.append((master_id, f"rIdM{m}"))
        pres_rels.append(f'<Relationship Id="rIdM{m}" Type="{REL}/slideMaster" Target="slideMasters/slideMaster{m}.xml"/>')
    pres_rels.append(f'<Relationship Id="rIdTh" Type="{REL}/theme" Target="theme/theme1.xml"/>')
    parts["ppt/presentation.xml"] = (HDR + f'<p:presentation {NS} saveSubsetFonts="1"><p:sldMasterIdLst>'
        + "".join(f'<p:sldMasterId id="{i}" r:id="{r}"/>' for i, r in master_ids)
        + f'</p:sldMasterIdLst><p:sldSz cx="{W}" cy="{H}"' + ("" if W == 12192000 else ' type="screen4x3"') + '/><p:notesSz cx="6858000" cy="9144000"/>'
        '<p:defaultTextStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>')
    parts["ppt/_rels/presentation.xml.rels"] = HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(pres_rels) + "</Relationships>"
    parts["_rels/.rels"] = HDR + f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="{REL}/extended-properties" Target="docProps/app.xml"/></Relationships>'
    parts["docProps/app.xml"] = (HDR + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
                                 f'<Application>{application}</Application>' + (f"<AppVersion>{app_version}</AppVersion>" if app_version else "") + "</Properties>")
    ct.append(("/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"))
    ct_xml = (HDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
              '<Default Extension="xml" ContentType="application/xml"/>'
              f'<Override PartName="/ppt/presentation.xml" ContentType="{main_ct}"/>'
              + "".join(f'<Override PartName="{p}" ContentType="{c}"/>' for p, c in ct) + "</Types>")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct_xml)
        for n, d in parts.items():
            z.writestr(n, d)


def to_potx(pptx: Path, potx: Path):
    """The plan's recipe: copy the .pptx, rewrite the main part's content type, rename to .potx."""
    with zipfile.ZipFile(pptx) as zin, zipfile.ZipFile(potx, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "[Content_Types].xml":
                data = data.decode().replace(CT_PRES, CT_POTX).encode()
            zout.writestr(info, data)


def _rewrite(src: Path, dst: Path, edit) -> None:
    """Copy a package, letting `edit(parts)` change its parts (a dict of name to bytes)."""
    with zipfile.ZipFile(src) as z:
        parts = {i.filename: z.read(i.filename) for i in z.infolist()}
    edit(parts)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", parts.pop("[Content_Types].xml"))
        for k, v in parts.items():
            z.writestr(k, v)


def add_logo(src: Path, dst: Path, png: bytes) -> None:
    """A picture (a logo) on 'Decorated Confidential' (slideLayout6): variant for the picture-in-art tests."""
    def edit(parts):
        lay, rels = "ppt/slideLayouts/slideLayout6.xml", "ppt/slideLayouts/_rels/slideLayout6.xml.rels"
        pic = ('<p:pic><p:nvPicPr><p:cNvPr id="900" name="Logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>'
               '<p:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
               '<p:spPr><a:xfrm><a:off x="10000000" y="5900000"/><a:ext cx="1500000" cy="700000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')
        parts[lay] = parts[lay].decode().replace("</p:spTree>", pic + "</p:spTree>", 1).encode()
        parts[rels] = parts[rels].decode().replace("</Relationships>", f'<Relationship Id="rIdLogo" Type="{REL}/image" Target="../media/logo.png"/></Relationships>').encode()
        parts["ppt/media/logo.png"] = png
        ct = parts["[Content_Types].xml"].decode()
        if 'Extension="png"' not in ct:
            ct = ct.replace("<Default ", '<Default Extension="png" ContentType="image/png"/><Default ', 1)
        parts["[Content_Types].xml"] = ct.encode()
    _rewrite(src, dst, edit)


def add_gradient_background(src: Path, dst: Path) -> None:
    """'Title Only' (slideLayout9) gets a dark two-stop gradient as its own background."""
    def edit(parts):
        lay = "ppt/slideLayouts/slideLayout9.xml"
        grad = ('<p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="101840"/></a:gs><a:gs pos="100000"><a:srgbClr val="3A1060"/></a:gs></a:gsLst>'
                '<a:lin ang="5400000" scaled="0"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>')
        parts[lay] = parts[lay].decode().replace('<p:cSld name="Title Only">', '<p:cSld name="Title Only">' + grad, 1).encode()
    _rewrite(src, dst, edit)


def remove_layout_name(src: Path, dst: Path) -> None:
    """'Title Only' loses its cSld@name (the attribute is optional)."""
    _rewrite(src, dst, lambda parts: parts.__setitem__("ppt/slideLayouts/slideLayout9.xml", parts["ppt/slideLayouts/slideLayout9.xml"].decode().replace('<p:cSld name="Title Only">', "<p:cSld>", 1).encode()))


def main_build(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for tag, W in (("", 12192000), ("-4x3", 9144000)):
        p = out / f"template{tag}.pptx"
        build(p, W)
        to_potx(p, out / f"template{tag}.potx")
    build(out / "template-deckster.pptx", 12192000, application="deckster", app_version=None)
    build(out / "template-deckster-old.pptx", 12192000, application="deck", app_version=None)  # older exports


if __name__ == "__main__":
    main_build(Path(sys.argv[1]))
    print("wrote template.pptx/.potx, template-4x3.pptx/.potx, template-deckster.pptx in", sys.argv[1])
