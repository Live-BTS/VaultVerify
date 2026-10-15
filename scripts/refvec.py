#!/usr/bin/env python3
"""Extract exact vector geometry from the reference PDF (design pt = design_px * 0.6)."""
import fitz, json

doc = fitz.open("/home/z/my-project/upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf")
pg = doc[0]
print("page size:", pg.rect)

def dump_region(y0pt, y1pt, x0pt=0, x1pt=612, label="", max_items=200):
    print(f"\n===== {label} (pt y {y0pt}-{y1pt}) =====")
    n = 0
    for d in pg.get_drawings():
        r = d["rect"]
        if r.y1 < y0pt or r.y0 > y1pt or r.x1 < x0pt or r.x0 > x1pt: continue
        n += 1
        if n > max_items: print("... more"); break
        fill = d.get("fill"); stroke = d.get("color")
        def f(c): return "#%02x%02x%02x" % tuple(int(round(v*255)) for v in c) if c else None
        w = d.get("width")
        kinds = [it[0] for it in d["items"]]
        print(f"[{d['type']}] rect=({r.x0:.2f},{r.y0:.2f},{r.x1:.2f},{r.y1:.2f}) w={r.width:.2f} h={r.height:.2f} fill={f(fill)} stroke={f(stroke)} lw={w} items={len(kinds)} {kinds[:6]}")
        # detail for curved paths (rings)
        if len(kinds) <= 14 and any(k in ("c", "l") for k in kinds):
            for it in d["items"]:
                if it[0] == "c":
                    print("    c", [(round(p.x, 2), round(p.y, 2)) for p in it[1:]])
                elif it[0] == "l":
                    print("    l", (round(it[1].x, 2), round(it[1].y, 2)), "->", (round(it[2].x, 2), round(it[2].y, 2)))

# rating-scale legend row (design 875-950 -> pt 525-570)
dump_region(525, 572, label="rating scale row")
# table first rows (design 1060-1180 -> pt 636-708) rings + pills
dump_region(636, 710, x0pt=180, label="table rows 1-3 (rings/pills)")
