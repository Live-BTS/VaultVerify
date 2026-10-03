#!/usr/bin/env python3
"""Word-level position comparison: reference vs current PDF, page 1."""
import pdfplumber

def words(pdf, page_no, band=None):
    with pdfplumber.open(pdf) as p:
        pg = p.pages[page_no - 1]
        out = {}
        for w in pg.extract_words():
            if band and not (band[0] <= w["top"] <= band[1]): continue
            key = (w["text"], round(w["top"] / 3))  # bucket top by 3pt
            out.setdefault(key, []).append((w["x0"], w["x1"], w["top"]))
        return out

REF = "upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf"
CUR = "download/pdfnew/cur-sam.pdf"
band = (330, 620)  # category overview + legends + table header zone

rw, cw = words(REF, 1, band), words(CUR, 1, band)
print(f"{'word':30s} {'ref x0..x1':18s} {'cur x0..x1':18s} {'dx0':>6s} {'dx1':>6s}")
seen = set()
for k, rv in sorted(rw.items(), key=lambda kv: kv[1][0][1]):
    if k in seen: continue
    seen.add(k)
    cv = cw.get(k)
    if not cv:
        print(f"{k[0]:30s} {rv[0][0]:7.1f}..{rv[0][1]:7.1f}  MISSING in cur (top {rv[0][2]:.1f})")
        continue
    r0, c0 = rv[0], cv[0]
    dx0, dx1 = c0[0] - r0[0], c0[1] - r0[1]
    flag = " <<<" if abs(dx0) > 0.6 or abs(dx1) > 0.6 else ""
    print(f"{k[0]:30s} {r0[0]:7.1f}..{r0[1]:7.1f}  {c0[0]:7.1f}..{c0[1]:7.1f}  {dx0:+6.2f} {dx1:+6.2f}{flag}")
