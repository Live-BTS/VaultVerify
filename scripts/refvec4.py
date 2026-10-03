#!/usr/bin/env python3
import fitz

doc = fitz.open("/home/z/my-project/upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf")

def spans(pno, y0, y1, label=""):
    pg = doc[pno]
    print(f"\n----- SPANS p{pno+1} y{y0}-{y1} {label} -----")
    d = pg.get_text("dict", clip=fitz.Rect(0, y0, 612, y1))
    for b in d["blocks"]:
        if b["type"] != 0: continue
        for l in b["lines"]:
            for s in l["spans"]:
                ox, oy = s["origin"]
                col = "#%06x" % s["color"]
                print(f"  ({ox:.1f},{oy:.1f}) sz={s['size']:.2f} f={s['font'][:22]:22s} c={col} '{s['text'][:70]}'")

def paths_detail(pno, ymax, label):
    pg = doc[pno]
    print(f"\n----- PATHS p{pno+1} {label} -----")
    for d in pg.get_drawings():
        r = d["rect"]
        if r.y1 > ymax: continue
        if len(d["items"]) in (6, 7, 8):
            pts = []
            for it in d["items"]:
                if it[0] == "l": pts.append(f"L({it[1].x:.1f},{it[1].y:.1f})->({it[2].x:.1f},{it[2].y:.1f})")
                elif it[0] == "c": pts.append(f"C({it[1].x:.1f},{it[1].y:.1f}|{it[4].x:.1f},{it[4].y:.1f})")
            print(f"  [{d['type']}] ({r.x0:.1f},{r.y0:.1f},{r.x1:.1f},{r.y1:.1f}) fill={d.get('fill')} :: {' '.join(pts[:4])}")

spans(0, 735, 760, "footer p1")
spans(1, 0, 60, "header p2")
spans(1, 610, 660, "footer p2")
spans(3, 600, 650, "additional q band p4")
spans(4, 30, 120, "p5 top")
spans(4, 120, 210, "p5 experience notes")
spans(4, 205, 340, "p5 notes+attest title")
spans(4, 340, 480, "p5 attestation")
spans(4, 480, 560, "p5 sig + footer")
paths_detail(0, 100, "cards/tile radius")
paths_detail(4, 60, "page5 bands")
