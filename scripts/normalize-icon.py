#!/usr/bin/env python3
"""
Normalizes "glass icon" reference images in src/assets so the actual glyph
fills a consistent share of its square canvas, regardless of how much native
padding the source image came with (icons are pasted from different sources/
generations, so this varies a lot — from ~92% to ~98% content coverage before
normalization, which reads as "not lined up" in a row of tiles even though
every icon renders through the identical CSS: position:absolute, inset:0,
object-fit:cover).

Usage:
  py -3.11 scripts/normalize-icon.py src/assets/some-new-icon-ref.webp [more files...]
  py -3.11 scripts/normalize-icon.py --all     # re-normalize every existing *-icon-ref*.webp

What it does, per file: crop to the tight bounding box of non-transparent
content (alpha > 0), then re-paste it centered on a transparent canvas of the
same original pixel size so the content fills TARGET_COVERAGE of the canvas
on its longer axis. Canvas resolution is preserved; only the internal margin
changes. Requires the source to have real alpha (RGBA) — these ref icons are
squircle app-icon-style renders with transparent margins, not flat photos.
"""
import sys
from pathlib import Path
from PIL import Image

TARGET_COVERAGE = 0.95  # matches the median of the well-behaved existing icons

ASSETS_DIR = Path(__file__).resolve().parent.parent / 'src' / 'assets'


def normalize(path: Path) -> None:
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    bbox = im.split()[-1].getbbox()
    if not bbox:
        print(f'skip {path.name}: fully transparent, nothing to normalize')
        return

    content = im.crop(bbox)
    cw, ch = content.size
    scale = (min(w, h) * TARGET_COVERAGE) / max(cw, ch)
    new_w, new_h = max(1, round(cw * scale)), max(1, round(ch * scale))
    content = content.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.paste(content, ((w - new_w) // 2, (h - new_h) // 2), content)
    canvas.save(path, format='WEBP', lossless=False, quality=92)
    print(f'normalized {path.name}: {cw}x{ch} content -> {new_w}x{new_h}, centered in {w}x{h} canvas')


def main(argv: list[str]) -> None:
    if argv == ['--all']:
        targets = sorted(ASSETS_DIR.glob('*icon-ref*.webp'))
    elif argv:
        targets = [Path(a) for a in argv]
    else:
        print(__doc__)
        sys.exit(1)

    for p in targets:
        normalize(p)


if __name__ == '__main__':
    main(sys.argv[1:])
