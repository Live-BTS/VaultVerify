#!/usr/bin/env python3
"""Measure reference ring geometry + pill heights from 150dpi renders."""
from PIL import Image

im = Image.open("/home/z/my-project/download/pdfcmp/ref/h-2.png").convert("RGB")
W, H = im.size  # 1275 x 1650, factor 1.25 from design
F = 1.25
px = im.load()

# find amber pixels (rating-2 ring) near ring column x=536 design = 670px, page-2 rows region y 250-460
minx, maxx, miny, maxy = 9999, 0, 9999, 0
samples = []
for y in range(int(240*F), int(400*F)):
    for x in range(int(500*F), int(575*F)):
        r, g, b = px[x, y]
        if r > 220 and 130 < g < 190 and b < 90:  # amber
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
print("amber ring bbox px:", minx, maxx, miny, maxy)
print("design: cx=%.1f cy=%.1f outer_d=%.1f" % ((minx+maxx)/2/F, (miny+maxy)/2/F, (maxx-minx)/F))

# thickness: scan horizontal line through center
cy = (miny+maxy)//2
runs, cur, color = [], None, None
for x in range(minx-3, maxx+4):
    r, g, b = px[x, cy]
    if r > 220 and 130 < g < 190 and b < 90: c = "amber"
    elif r > 200 and g > 200 and b > 200: c = "white"
    elif abs(r-g) < 30 and abs(g-b) < 30 and 180 < r < 240: c = "gray"
    else: c = "other"
    if c != color:
        if color: runs.append((color, cur, x-1))
        color, cur = c, x
runs.append((color, cur, maxx+3))
print("center-line runs (px):", [(c, b-a+1) for c, a, b in runs])
print("center-line runs (design):", [("%.10s" % c, round((b-a+1)/F, 2)) for c, a, b in runs])

# gray remainder color sample: left side of the same ring
lx = minx + 4
print("gray sample rgb:", px[lx, cy-10] if True else None)

# pill height: navy "Within 3 months" pill on same page-2 region, right column x 740-880 design
minx2, maxx2, miny2, maxy2 = 9999, 0, 9999, 0
for y in range(int(240*F), int(400*F)):
    for x in range(int(740*F), int(880*F)):
        r, g, b = px[x, y]
        if r < 60 and g < 80 and b < 110 and b > 40:  # navy
            minx2, maxx2 = min(minx2, x), max(maxx2, x)
            miny2, maxy2 = min(miny2, y), max(maxy2, y)
print("navy pill bbox design: x %.1f-%.1f  y %.1f-%.1f  h=%.1f" % (
    minx2/F, maxx2/F, miny2/F, maxy2/F, (maxy2-miny2)/F))
