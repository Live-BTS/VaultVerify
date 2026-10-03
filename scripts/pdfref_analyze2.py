#!/usr/bin/env python3
"""Precision geometry + color pass on the reference renders (1020x1320 = 120dpi of letter)."""
from PIL import Image
BASE = "/home/z/my-project/download/pdfcheck"
p1 = Image.open(f"{BASE}/refhi-1.png").convert("RGB")
p2 = Image.open(f"{BASE}/refhi-2.png").convert("RGB")
p5 = Image.open(f"{BASE}/refhi-5.png").convert("RGB")

def hexat(img, x, y):
    r, g, b = img.getpixel((x, y))
    return f"#{r:02x}{g:02x}{b:02x}"

def vscan(img, x, y0, y1, label):
    """print color transitions along a vertical strip"""
    prev = None; out = []
    for y in range(y0, y1):
        c = img.getpixel((x, y))
        # quantize to reduce noise
        q = tuple(v // 12 for v in c)
        if q != prev:
            out.append(f"y={y}:{hexat(img,x,y)}")
            prev = q
    print(f"[vscan {label} x={x}] " + " ".join(out))

def hscan(img, y, x0, x1, label):
    prev = None; out = []
    for x in range(x0, x1):
        c = img.getpixel((x, y))
        q = tuple(v // 12 for v in c)
        if q != prev:
            out.append(f"x={x}:{hexat(img,x,y)}")
            prev = q
    print(f"[hscan {label} y={y}] " + " ".join(out[:40]))

print("== PAGE 1 ==")
vscan(p1, 700, 100, 145, "header bottom / green line")
vscan(p1, 90, 300, 340, "summary card top edge")
vscan(p1, 90, 500, 545, "summary card bottom")
vscan(p1, 90, 540, 560, "cat card top")
vscan(p1, 90, 860, 895, "cat card bottom")
vscan(p1, 90, 960, 1040, "table band edges")
vscan(p1, 90, 1030, 1090, "cat band")
vscan(p1, 500, 1225, 1290, "footer divider")
vscan(p1, 123, 165, 220, "avatar vertical")
hscan(p1, 223, 170, 400, "pills row")
hscan(p1, 448, 95, 240, "mix donut horizontal")
hscan(p1, 400, 95, 240, "mix donut upper")
vscan(p1, 612, 380, 520, "recent donut vertical")
hscan(p1, 448, 545, 700, "recent donut horizontal")
hscan(p1, 623, 355, 545, "cat bar")
hscan(p1, 944, 120, 720, "recency pills legend")
vscan(p1, 536, 1070, 1105, "row ring vertical")
hscan(p1, 1088, 545, 940, "row1: pill + recency")
hscan(p1, 1124, 545, 940, "row2: pill + recency")
print("== colors ==")
print("title 'Summary at a glance' text:", hexat(p1, 105, 348))
print("legend count '32':", hexat(p1, 410, 421))
print("donut amber?:", hexat(p1, 112, 405), hexat(p1, 120, 415))
print("donut red?:", hexat(p1, 163, 396), hexat(p1, 158, 393))
print("recent navy seg:", hexat(p1, 640, 400))
print("recent pale seg:", hexat(p1, 575, 415))
print("page bg:", hexat(p1, 500, 300))
print("== PAGE 5 ==")
vscan(p5, 700, 70, 110, "slim header bottom + green line")
vscan(p5, 90, 112, 160, "subheading band")
vscan(p5, 500, 160, 230, "yes/no row + divider")
hscan(p5, 175, 750, 950, "yes toggle")
hscan(p5, 315, 750, 950, "no-selected toggle")
vscan(p5, 100, 400, 470, "answer box + accent")
vscan(p5, 80, 570, 960, "attestation card + accent bar")
hscan(p5, 690, 90, 160, "checkbox")
print("heading teal:", hexat(p5, 110, 616), hexat(p1, 108, 585))
print("yes toggle green:", hexat(p5, 810, 175))
print("no selected navy:", hexat(p5, 890, 315))
print("accent green bar:", hexat(p5, 69, 700), hexat(p5, 96, 437))
print("checkbox green:", hexat(p5, 115, 689))
print("signed electronically green:", hexat(p5, 400, 876))
print("slim hdr right text:", hexat(p5, 800, 46))
