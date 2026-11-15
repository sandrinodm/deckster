#!/usr/bin/env python3
"""Generate original raster probes and app fallback media with Python 3 and ffmpeg.

Run from the repository with: python3 scripts/generate-fixture-media.py
The images use only arithmetic, rectangles and project-authored pixel patterns.
No downloaded assets, fonts or external Python packages are used.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess


class Canvas:
    """An RGB canvas with clipped, filled rectangles in a 1000 by 500 coordinate space."""

    def __init__(self, width: int, height: int, color: tuple[int, int, int]):
        self.width = width
        self.height = height
        self.pixels = bytearray(bytes(color) * width * height)

    def rectangle(self, x: int, y: int, width: int, height: int, color: tuple[int, int, int]):
        left = max(0, x * self.width // 1000)
        top = max(0, y * self.height // 500)
        right = min(self.width, (x + width) * self.width // 1000)
        bottom = min(self.height, (y + height) * self.height // 500)
        row = bytes(color) * max(0, right - left)
        for line in range(top, bottom):
            start = (line * self.width + left) * 3
            self.pixels[start:start + len(row)] = row

    def ppm(self) -> bytes:
        return f"P6\n{self.width} {self.height}\n255\n".encode() + self.pixels


def write_image(image: Canvas, target: Path):
    """Encode one frame, omitting input metadata."""
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-vcodec", "ppm",
        "-i", "pipe:0", "-map_metadata", "-1", "-frames:v", "1", "-q:v", "2",
        str(target),
    ], input=image.ppm(), check=True)


def probe(kind: str, width: int, height: int) -> Canvas:
    """Cover the contrast cases: a midtone field, dark field, light field and checks."""
    colors = {"grass": (107, 132, 78), "night": (19, 29, 48), "snow": (239, 244, 249)}
    if kind == "checker":
        image = Canvas(width, height, (239, 231, 211))
        for row in range(14):
            for column in range(25):
                if (row + column) % 2 == 0:
                    image.rectangle(column * 40, row * 40, 40, 40, (52, 40, 26))
        return image

    if kind == "hall":
        image = Canvas(width, height, (247, 248, 250))
        image.rectangle(0, 310, 1000, 190, (240, 242, 245))
        for column in range(8):
            image.rectangle(30 + column * 135, 30, 65, 280, (228, 234, 242))
            image.rectangle(36 + column * 135, 38, 53, 260, (250, 252, 255))
        return image

    color = colors[kind]
    image = Canvas(width, height, color)
    # The middle tone intentionally keeps dark unprotected caption text below AA contrast.
    for row in range(50):
        for column in range(100):
            delta = ((row * 31 + column * 17) % 13) - 6
            tile = tuple(max(0, min(255, value + delta)) for value in color)
            image.rectangle(column * 10, row * 10, 10, 10, tile)
    return image


def app_frame(width: int, height: int, frame: int) -> Canvas:
    """Draw a fictional browser dashboard with a moving progress indicator."""
    image = Canvas(width, height, (238, 240, 243))
    image.rectangle(55, 45, 890, 410, (255, 255, 255))
    image.rectangle(55, 45, 890, 36, (222, 226, 232))
    for index, color in enumerate(((211, 92, 84), (221, 174, 73), (85, 160, 121))):
        image.rectangle(70 + index * 16, 58, 8, 8, color)
    image.rectangle(160, 56, 640, 13, (246, 247, 249))
    image.rectangle(80, 105, 125, 325, (245, 246, 248))
    for row in range(6):
        image.rectangle(95, 125 + row * 30, 90, 7, (187, 195, 207))
    image.rectangle(230, 110, 240, 16, (40, 49, 67))
    image.rectangle(230, 142, 390, 8, (163, 173, 189))
    for index in range(3):
        image.rectangle(230 + index * 230, 182, 205, 78, (236, 240, 246))
        image.rectangle(248 + index * 230, 198, 86, 7, (145, 159, 181))
        image.rectangle(248 + index * 230, 222, 42 + index * 24, 15, (59, 88, 164))
    image.rectangle(230, 290, 665, 116, (245, 247, 250))
    for index, bar_height in enumerate((30, 45, 58, 40, 70, 55, 82, 68)):
        image.rectangle(255 + index * 76, 388 - bar_height, 43, bar_height, (80, 112, 186))
    image.rectangle(230, 426, 665, 5, (223, 229, 239))
    image.rectangle(230, 426, 45 + frame * 12, 5, (51, 92, 196))
    return image


def generate_apps(root: Path):
    """Write a matching poster and four-second VP9 fallback, then copy the test variant."""
    assets = root / "decks/apps-demo/assets"
    write_image(app_frame(2472, 1236, 24), assets / "external-poster.png")
    target = assets / "external-fallback.webm"
    encoder = subprocess.Popen([
        "ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-vcodec", "ppm",
        "-framerate", "12", "-i", "pipe:0", "-map_metadata", "-1", "-an",
        "-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0", "-pix_fmt", "yuv420p",
        "-threads", "1", "-fflags", "+bitexact", str(target),
    ], stdin=subprocess.PIPE)
    assert encoder.stdin is not None
    try:
        for frame in range(48):
            encoder.stdin.write(app_frame(1648, 824, frame).ppm())
    finally:
        encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError("ffmpeg failed to encode the app fallback")
    duplicate = root / "packages/vite-plugin/e2e/fixtures/decks/apps-cases/assets/fallback.webm"
    duplicate.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(target, duplicate)


def generate_probes(root: Path):
    """Keep the dimensions and brightness families used by the browser lint suites."""
    layout = root / "packages/cli/fixtures/decks/layout-probes/assets"
    for kind in ("checker", "grass", "night", "snow"):
        write_image(probe(kind, 960, 540), layout / f"{kind}.jpg")
    layers = root / "packages/cli/fixtures/brand-files/layered/backgrounds"
    for kind in ("checker", "grass"):
        write_image(probe(kind, 1920, 1080), layers / f"{kind}.jpg")
    backdrop = root / "packages/cli/fixtures/decks/backdrop-probes/assets/hall.jpg"
    write_image(probe("hall", 1920, 1080), backdrop)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--only", choices=("all", "probes", "apps"), default="all")
    options = parser.parse_args()
    if options.only in ("all", "probes"):
        generate_probes(options.root)
    if options.only in ("all", "apps"):
        generate_apps(options.root)


if __name__ == "__main__":
    main()
