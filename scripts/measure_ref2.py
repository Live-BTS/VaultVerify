#!/usr/bin/env python3
"""Measure reference ring geometry precisely via row/col scans."""
from PIL import Image

im = Image.open("/home/z/my-project/download/pdfcmp/ref/h-2.png").convert("RGB")
W, H = im.size
F = 1.25
px = im.load()

def is_amber(p): r, g, b = p; return r > 220 and 120 < g < 200 and b < 100
def is_blue(p): r, g, b = p; return b > 200 and r < 120 and 90 < g < 180
def is_green(p): r, g, b = p; return g > 130 and r < 110 and b < 130 and g > r + 40 and g > b + 30
def is_red(p): r, g, b = p; return r > 200 and g < 110 and b < 110

def scan_band(x0, x1, y0, y1, test):
    """return list of (ystart, yend) bands (px) where test matches in x-range"""
    bands, cur = [], None
    for y in range(y0, y1):
        hit = any(test(px[x, y]) for x in range(x0, x1))
        if hit and cur is None: cur = y
        if not hit and cur is not None: bands.append((cur, y - 1)); cur = None
    if cur is not None: bands.append((cur, y1 - 1))
    return bands

# ring column: x 500..575 design -> 625..719 px ; page-2 top rows region y 180..560 design -> 225..700 px
bands = scan_band(int(500*F), int(575*F), int(180*F), int(560*F), is_amber)
print("amber bands (design y):", [(round(a/F, 1), round(b/F, 1), round((b-a+1)/F, 1)) for a, b in bands])

if bands:
    a, b = bands[0]
    cy = (a + b) // 2
    # horizontal scan through ring center
    runs, color, cur = [], None, None
    for x in range(int(500*F), int(575*F)):
        p = px[x, cy]
        c = "amber" if is_amber(p) else ("gray" if abs(p[0]-p[1]) < 25 and abs(p[1]-p[2]) < 25 and 150 < p[0] < 235 else ("white" if p[0] > 240 and p[1] > 240 and p[2] > 240 else "other"))
        if c != color:
            if color: runs.append((color, cur, x - 1))
            color, cur = c, x
    runs.append((color, cur, int(575*F) - 1))
    print("ring center-line runs (design):", [(c, round((e - s + 1)/F, 2)) for c, s, e in runs if e - s > 0])
    # vertical scan through ring center x
    # find amber x-center
    xs = [x for x in range(int(500*F), int(575*F)) if is_amber(px[x, cy])]
    cx = (min(xs) + max(xs)) // 2
    vruns, color, cur = [], None, None
    for y in range(a - 8, b + 9):
        p = px[cx, y]
        c = "amber" if is_amber(p) else ("gray" if abs(p[0]-p[1]) < 25 and abs(p[1]-p[2]) < 25 and 150 < p[0] < 235 else ("white" if p[0] > 240 and p[1] > 240 and p[2] > 240 else "other"))
        if c != color:
            if color: vruns.append((color, cur, y - 1))
            color, cur = c, y
    vruns.append((color, cur, b + 8))
    print("ring v-scan runs (design):", [(c, round((e - s + 1)/F, 2)) for c, s, e in vruns if e - s > 0])
    print("gray rgb sample:", px[int(510*F), cy])
