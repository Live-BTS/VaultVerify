#!/usr/bin/env python3
"""Sample colors + save crops from the reference PDF renders (120dpi, 1700x2200px)."""
from PIL import Image
import os

BASE = "/home/z/my-project/download/pdfcheck"

p1 = Image.open(f"{BASE}/refhi-1.png").convert("RGB")
p5 = Image.open(f"{BASE}/refhi-5.png").convert("RGB")
print("p1 size:", p1.size)

# 120dpi render of a 612x792pt page = 1020x1320 px → design coords = px coords 1:1
K = 1.0

def sample(img, dx, dy, label):
    x, y = int(dx * K), int(dy * K)
    r, g, b = img.getpixel((x, y))
    print(f"{label:34s} design({dx:4},{dy:4}) px({x:4},{y:4})  #{r:02x}{g:02x}{b:02x}")

# page 1 samples
sample(p1, 500, 60,   "header teal band")
sample(p1, 500, 121,  "green line under header")
sample(p1, 123, 191,  "avatar circle")
sample(p1, 195, 223,  "RN pill (navy)")
sample(p1, 262, 223,  "General pill bg")
sample(p1, 205, 448,  "mix donut right (green)")
sample(p1, 130, 490,  "mix donut bottom-left (blue)")
sample(p1, 105, 448,  "mix donut left (amber)")
sample(p1, 165, 392,  "mix donut top (red)")
sample(p1, 660, 448,  "recent donut right (navy)")
sample(p1, 590, 490,  "recent donut bottom-left (steel)")
sample(p1, 565, 448,  "recent donut left (pale)")
sample(p1, 500, 565,  "category card bg")
sample(p1, 450, 623,  "category bar fill")
sample(p1, 530, 623,  "category bar track")
sample(p1, 300, 1000, "table header band")
sample(p1, 500, 1057, "category band bg")
sample(p1, 535, 1111, "ring stroke top (green row?)")
sample(p1, 536, 1088, "ring stroke row1 (blue?)")
sample(p1, 605, 1088, "Experienced pill bg")
sample(p1, 605, 1124, "Proficient pill bg")
sample(p1, 800, 1088, "steel pill bg")
sample(p1, 800, 1124, "navy pill bg")
sample(p1, 100, 447,  "mix donut far left")

# crops (design-space boxes)
def crop(img, box, name, page="1"):
    x0, y0, x1, y1 = [int(v * K) for v in box]
    img.crop((x0, y0, x1, y1)).save(f"{BASE}/crops/{name}.png")
    print("saved crop", name, (x0, y0, x1, y1))

crop(p1, (0, 0, 1020, 130), "A_header")
crop(p1, (50, 125, 970, 295), "B_card")
crop(p1, (50, 300, 970, 530), "C_summary")
crop(p1, (50, 535, 970, 880), "D_catoverview")
crop(p1, (50, 880, 970, 1200), "E_legends_rows")
crop(p1, (0, 1220, 1020, 1320), "F_footer1")
crop(p5, (0, 0, 1020, 700), "G_page5_top", "5")
crop(p5, (0, 700, 1020, 1320), "H_page5_bottom", "5")
print("done")
