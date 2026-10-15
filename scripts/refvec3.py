#!/usr/bin/env python3
"""Extract text spans (size/font/color/origin), opacities, and path radii from reference PDF."""
import fitz

doc = fitz.open("/home/z/my-project/upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf")

def spans(pno, y0=0, y1=800, label=""):
    pg = doc[pno]
    print(f"\n----- SPANS p{pno+1} y{y0}-{y1} {label} -----")
    d = pg.get_text("dict", clip=fitz.Rect(0, y0, 612, y1))
    for b in d["blocks"]:
        if b["type"] != 0: continue
        for l in b["lines"]:
            for s in l["spans"]:
                col = "#%06x" % s["color"]
                ox, oy = s["origin"]
                print(f"  ({ox:.1f},{oy:.1f}) sz={s['size']:.2f} f={s['font'][:28]:28s} c={col} '{s['text'][:60]}'")

def opac(pno):
    pg = doc[pno]
    print(f"\n----- OPACITY p{pno+1} -----")
    seen = set()
    for d in pg.get_drawings():
        r = d["rect"]
        key = (d.get("fill"), round(r.width, 1), round(r.height, 1))
        fo = d.get("fill_opacity"); so = d.get("stroke_opacity")
        if fo is not None and fo < 1 or so is not None and so < 1:
            k = (str(d.get("fill")), str(d.get("color")), fo, so, round(r.width), round(r.height))
            if k in seen: continue
            seen.add(k)
            print(f"  fill={d.get('fill')} str={d.get('color')} fo={fo} so={so} rect=({r.x0:.0f},{r.y0:.0f},{r.x1:.0f},{r.y1:.0f})")

def radius_probe(pno):
    pg = doc[pno]
    print(f"\n----- RADIUS PROBES p{pno+1} -----")
    for d in pg.get_drawings():
        r = d["rect"]
        items = d["items"]
        if len(items) == 8 and r.height > 12:  # rounded rect
            first = items[0]
            if first[0] == "l":
                p_start = first[1]; p_end = first[2]
                # find adjacent curve to measure radius
                nxt = items[1]
                if nxt[0] == "c":
                    c0 = nxt[1]
                    rad = abs(c0.x - p_end.x) if abs(c0.x - p_end.x) > 0.5 else abs(c0.y - p_end.y)
                    print(f"  rect h={r.height:.1f} w={r.width:.1f} fill={d.get('fill')} radius~{abs(c0.x-p_end.x):.2f}/{abs(c0.y-p_end.y):.2f} (start {p_start.x:.1f},{p_start.y:.1f} end {p_end.x:.1f},{p_end.y:.1f})")

# fonts used
print("----- FONTS -----")
for pno in range(5):
    for f in doc.get_page_fonts(pno):
        print(f"  p{pno+1}: {f[3]} {f[4]}")

spans(0, 0, 130, "header")
spans(0, 130, 310, "candidate card + summary title")
spans(0, 340, 530, "category overview")
spans(0, 570, 730, "table band + rows")
spans(0, 1220, 792 if False else 792, "footer")
opac(0)
radius_probe(0)
