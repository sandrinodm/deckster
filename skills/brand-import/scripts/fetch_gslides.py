# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Download a Google Slides deck as PPTX and PDF from a share link.

Usage:
  uv run fetch_gslides.py "<share link or presentation id>" --out <dir>

Works without credentials only when the deck is shared as "Anyone with the link"
(viewer is enough) or is public. Anything else returns a sign-in page or a 404, and
this script then explains what to ask the user for instead of guessing.

Writes <out>/deck.pptx and <out>/deck.pdf and prints the next command to run.
The PPTX carries the theme, masters and layouts. The PDF is Google's own render
with the real fonts embedded, so it doubles as the page images and removes the
need for LibreOffice:

  uv run extract_pptx.py <out>/deck.pptx --pdf <out>/deck.pdf --out <dir> --source-type gslides
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _netsafe as N  # noqa: E402

# A deck is large but not unbounded; Google answers an export with one or two redirects to its file host.
MAX_EXPORT_BYTES = 400 * 1024 * 1024

MAGIC = {"pptx": b"PK\x03\x04", "pdf": b"%PDF"}


def presentation_id(link: str) -> tuple[str, bool]:
    """Return (id, published). Published-to-web links use a different id that cannot be exported."""
    m = re.search(r"/presentation/d/e/([A-Za-z0-9_-]+)", link)
    if m:
        return m.group(1), True
    m = re.search(r"/presentation/(?:u/\d+/)?d/([A-Za-z0-9_-]{20,})", link)
    if m:
        return m.group(1), False
    m = re.search(r"[?&]id=([A-Za-z0-9_-]{20,})", link)
    if m:
        return m.group(1), False
    if re.fullmatch(r"[A-Za-z0-9_-]{20,}", link.strip()):
        return link.strip(), False
    sys.exit("Could not find a presentation id in that link.")


def fetch(url: str, dest: Path, kind: str) -> str | None:
    # The same guarded fetch as for web pages: https to public addresses only, each redirect checked, a size cap.
    policy = N.Policy(max_bytes=MAX_EXPORT_BYTES, max_total_bytes=MAX_EXPORT_BYTES, timeout=180, max_redirects=5)
    try:
        data, _kind = N.fetch(url, policy)
    except N.Blocked as exc:
        return str(exc)
    if not data.startswith(MAGIC[kind]):
        return "got a web page instead of a file (the deck is not shared by link, or needs sign-in)"
    dest.write_bytes(data)
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("link")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    pid, published = presentation_id(args.link)
    if published:
        sys.exit(
            "This is a 'Publish to the web' link (/d/e/...). It only serves the viewer, not exports.\n"
            "Ask for the normal share link (docs.google.com/presentation/d/<id>/edit) with 'Anyone with the link',\n"
            "or for File > Download > Microsoft PowerPoint (.pptx) and File > Download > PDF."
        )
    args.out.mkdir(parents=True, exist_ok=True)
    failed = {}
    for kind in ("pptx", "pdf"):
        err = fetch(f"https://docs.google.com/presentation/d/{pid}/export/{kind}", args.out / f"deck.{kind}", kind)
        if err:
            failed[kind] = err
        else:
            print(f"saved {args.out / f'deck.{kind}'}")
    if failed:
        print("could not download: " + "; ".join(f"{k}: {v}" for k, v in failed.items()), file=sys.stderr)
        print(
            "Ask the user to either set sharing to 'Anyone with the link: Viewer', or to send\n"
            "File > Download > Microsoft PowerPoint (.pptx) and File > Download > PDF Document (.pdf).\n"
            "Exports can also be blocked by the owner ('Viewers and commenters can see the option to download' unticked)\n"
            "or by a Workspace admin; in that case only the owner can produce the files.",
            file=sys.stderr,
        )
        sys.exit(2 if len(failed) == 2 else 0)
    print(f"next: uv run extract_pptx.py {args.out / 'deck.pptx'} --pdf {args.out / 'deck.pdf'} --out <dir> --source-type gslides")


if __name__ == "__main__":
    main()
