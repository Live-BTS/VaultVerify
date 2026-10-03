#!/usr/bin/env python3
import fitz
doc = fitz.open("/home/z/my-project/upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf")

print("--- p2 header shapes (all) ---")
for d in doc[1].get_drawings():
    r = d["rect"]
    if r.y1 < 60:
        fo = d.get("fill_opacity")
        print(f"  [{d['type']}] ({r.x0:.1f},{r.y0:.1f})-({r.x1:.1f},{r.y1:.1f}) fill={d.get('fill')} fo={fo}")

print("--- p4 navy band rect ---")
for d in doc[3].get_drawings():
    r = d["rect"]
    if 600 < r.y0 < 650 and r.width > 400:
        print(f"  ({r.x0:.1f},{r.y0:.1f})-({r.x1:.1f},{r.y1:.1f}) h={r.height:.1f} fill={d.get('fill')}")

print("--- p3 rows: dividers + ring centers (Pain Mgmt 2-line row) ---")
divs = []
rings = []
for d in doc[2].get_drawings():
    r = d["rect"]
    if d["type"] == "s" and r.height == 0 and r.width > 400 and r.y0 < 300:
        divs.append(r.y0)
    if d["type"] == "s" and abs(r.width - 7.3) < 0.5 and r.y0 < 300:
        rings.append((round(r.x0, 1), round(r.y0, 1)))
print("  dividers:", divs[:8])
print("  ring arcs:", rings[:8])

print("--- p3 text: 2-line row baselines ---")
dd = doc[2].get_text("dict", clip=fitz.Rect(0, 130, 612, 220))
for b in dd["blocks"]:
    if b["type"] != 0: continue
    for l in b["lines"]:
        for s in l["spans"]:
            ox, oy = s["origin"]
            if s["size"] > 7:
                print(f"  ({ox:.1f},{oy:.1f}) sz={s['size']:.2f} '{s['text'][:50]}'")
