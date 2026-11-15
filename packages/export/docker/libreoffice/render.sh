#!/bin/sh
# render <file.pptx> <out-dir> <dpi>: installs the fonts mounted at /fonts, converts the
# presentation to PDF with LibreOffice and rasterises every page to <out-dir>/page-N.png.
# Fonts are named "<Family>__<anything>.<woff2|ttf|otf>": each is installed under that family
# name, as a viewer who installed the brand's fonts would have it. A font that already carries
# that family name (a static instance the export cut) keeps its own names and styles.
set -e
input="$1"
out="$2"
dpi="${3:-72}"
mkdir -p "$HOME/.fonts" "$out"
if [ -d /fonts ]; then
  python3 - <<'PY'
import glob, os
from fontTools.ttLib import TTFont
home = os.path.expanduser('~/.fonts')
for path in glob.glob('/fonts/*'):
    base = os.path.basename(path)
    family = base.split('__')[0].rsplit('.', 1)[0]
    font = TTFont(path)
    font.flavor = None
    names = font['name']
    current = names.getDebugName(16) or names.getDebugName(1)
    if current != family:
        for record in list(names.names):
            if record.nameID in (1, 16, 4):
                names.setName(family, record.nameID, record.platformID, record.platEncID, record.langID)
            elif record.nameID == 6:
                names.setName(family.replace(' ', ''), record.nameID, record.platformID, record.platEncID, record.langID)
    font.save(os.path.join(home, base.rsplit('.', 1)[0] + '.ttf'))
PY
  fc-cache -f >/dev/null 2>&1 || true
fi
soffice --headless --convert-to pdf --outdir "$out" "$input" >/dev/null 2>&1
pdf="$out/$(basename "$input" .pptx).pdf"
pdftoppm -r "$dpi" -png "$pdf" "$out/page"
