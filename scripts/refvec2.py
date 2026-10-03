#!/usr/bin/env python3
"""Dump all vector shapes + text from reference PDF for exact replication."""
import fitz

doc = fitz.open("/home/z/my-project/upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf")

def f(c): return "#%02x%02x%02x" % tuple(int(round(v*255)) for v in c) if c else None

def dump_page(pno, region=None, compact=True):
    pg = doc[pno]
    print(f"\n########## PAGE {pno+1} ##########")
    for d in pg.get_drawings():
        r = d["rect"]
        if region and (r.y1 < region[0] or r.y0 > region[1]): continue
        kinds = "".join(it[0] for it in d["items"])
        line = f"[{d['type']}] ({r.x0:.1f},{r.y0:.1f})-({r.x1:.1f},{r.y1:.1f}) w={r.width:.1f} h={r.height:.1f} fill={f(d.get('fill'))} str={f(d.get('color'))} lw={d.get('width')} n={len(kinds)} {kinds[:10]}"
        print(line)

def dump_text(pno, y0, y1):
    pg = doc[pno]
    print(f"\n----- TEXT page {pno+1} y {y0}-{y1} -----")
    for w in pg.get_text("words"):
        x0, yy0, x1, yy1, word = w[0], w[1], w[2], w[3], w[4]
        if yy1 < y0 or yy0 > y1: continue
        print(f"  ({x0:.1f},{yy0:.1f})-({x1:.1f},{yy1:.1f}) '{word}'")

# page 1: full shape inventory (compact)
dump_page(0)
# text of rating-scale + last-performed legend rows
dump_text(0, 528, 575)
# page 5: attestation shapes
dump_page(4, region=(60, 740))
