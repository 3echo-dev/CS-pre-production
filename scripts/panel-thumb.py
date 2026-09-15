#!/usr/bin/env python3
"""Print a storyboard panel as a small JPEG data URI for the board.

    python panel-thumb.py <image> [--width 360] [--quality 72]

The board cannot load images from any host, so a review-size copy travels inside the panel
document. 360 px wide at quality 72 is about 30 to 50 KB for a 9:16 sketch. Exit 1 when the
file does not open as an image or its short side is under 200 px (the make-image rule).
"""
import argparse, base64, io, sys
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('image')
ap.add_argument('--width', type=int, default=360)
ap.add_argument('--quality', type=int, default=72)
a = ap.parse_args()
try:
    im = Image.open(a.image)
    im.load()
except Exception as e:
    print('not an image: ' + str(e), file=sys.stderr)
    sys.exit(1)
if min(im.size) < 200:
    print('too small: %dx%d, short side under 200 px' % im.size, file=sys.stderr)
    sys.exit(1)
if im.mode not in ('RGB', 'L'):
    im = im.convert('RGB')
w = a.width
h = max(1, round(im.size[1] * w / im.size[0]))
im = im.resize((w, h), Image.LANCZOS)
buf = io.BytesIO()
im.save(buf, 'JPEG', quality=a.quality, optimize=True)
sys.stdout.write('data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii'))
