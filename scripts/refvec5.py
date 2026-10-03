#!/usr/bin/env python3
"""Final measurements: pill text heights, footer colors, p2 band positions, card radii."""
import fitz
from PIL import Image

doc = fitz.open("/home/z/my-project/upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf")

# 1. p2 band rects
print("--- p2 rects ---")
for d in doc[1].get_drawings():
    r = d["rect"]
    if r.width > 400:
        it = d["items"]
        print(f"  [{d['type']}] ({r.x0:.1f},{r.y0:.1f})-({r.x1:.1f},{r.y1:.1f}) h={r.height:.1f} fill={d.get('fill')} n={len(it)}")

# 2. p5 footer spans
print("--- p5 footer spans ---")
dd = doc[4].get_text("dict", clip=fitz.Rect(0, 700, 612, 770))
for b in dd["blocks"]:
    if b["type"] != 0: continue
    for l in b["lines"]:
        for s in l["spans"]:
            ox, oy = s["origin"]
            print(f"  ({ox:.1f},{oy:.1f}) sz={s['size']:.2f} c=#{s['color']:06x} '{s['text'][:80]}'")

# 3. radii via curve endpoints: first curve after first line, control point distance
print("--- radii ---")
for pno, filt in [(0, None), (4, None)]:
    for d in doc[pno].get_drawings():
        r = d["rect"]
        if len(d["items"]) < 4: continue
        its = d["items"]
        # find first 'c' item and preceding 'l' end
        for i, it in enumerate(its):
            if it[0] == "c" and i > 0 and its[i-1][0] == "l":
                pend = its[i-1][2]; c0 = it[1]; c1 = it[4]
                dx = abs(c1.x - pend.x); dy = abs(c1.y - pend.y)
                rad = dx if dx > 0.6 else dy
                if rad > 1:
                    print(f"  p{pno+1} ({r.x0:.0f},{r.y0:.0f},{r.x1:.0f},{r.y1:.0f}) fill={d.get('fill')} r~{rad:.1f}pt")
                break

# 4. pill text pixel height (150dpi render): row pill on p2 (design x743-874, cy varies) & legend pill p1
im1 = Image.open("/home/z/my-project/download/pdfcmp/ref/h-1.png").convert("RGB")
p1 = im1.load()
# legend navy pill: design (190,930.8)-(317.2,952.5) -> px x 237-396, y 1163-1190
ys = []
for y in range(1150, 1200):
    row_white = sum(1 for x in range(300, 380) if p1[x, y][0] > 235 and p1[x, y][1] > 235 and p1[x, y][2] > 235)
    if row_white > 3: ys.append(y)
print("legend pill white-text y-rows(px):", ys[:2], "...", ys[-2:] if ys else "", "-> h(px)=", (ys[-1]-ys[0]+1) if ys else 0, "design:", (ys[-1]-ys[0]+1)/1.25 if ys else 0)

im2 = Image.open("/home/z/my-project/download/pdfcmp/ref/h-2.png").convert("RGB")
p2 = im2.load()
# row pill p2 row1: design y 1078.3-1100 -> px 1348-1375; text x 771-850 design -> px 964-1063
ys2 = []
for y in range(1340, 1385):
    row_white = sum(1 for x in range(965, 1060) if p2[x, y][0] > 235 and p2[x, y][1] > 235 and p2[x, y][2] > 235)
    if row_white > 3: ys2.append(y)
print("row pill white-text y-rows(px):", ys2[:2], "...", "-> design h:", (ys2[-1]-ys2[0]+1)/1.25 if ys2 else 0)

# 5. footer color check p1: crop strip design y 1240-1265 -> px y 1550-1582
crop = im1.crop((40, 1545, 640, 1590)).resize((1800, 135))
crop.save("/home/z/my-project/download/pdfcmp/ref-footer.png")
print("saved ref-footer.png")
