#!/usr/bin/env python3
"""Word-level comparison in the SUMMARY band (186..320) ref vs current."""
import pdfplumber

def words(pdf, band):
    with pdfplumber.open(pdf) as p:
        pg = p.pages[0]
        out = {}
        for w in pg.extract_words():
            if not (band[0] <= w["top"] <= band[1]): continue
            out.setdefault(w["text"], []).append((w["x0"], w["x1"], w["top"]))
        return out

REF = "upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf"
CUR = "download/pdfnew/cur-sam.pdf"
rw, cw = words(REF, (186, 322)), words(CUR, (186, 322))
print(f"{'word':22s} {'ref x0..x1 (top)':24s} {'cur x0..x1 (top)':24s} delta")
for t, rv in rw.items():
    for i, r0 in enumerate(rv):
        cv = cw.get(t, [])
        c0 = cv[i] if i < len(cv) else None
        if c0:
            print(f"{t:22s} {r0[0]:6.1f}..{r0[1]:6.1f} ({r0[2]:5.1f})  {c0[0]:6.1f}..{c0[1]:6.1f} ({c0[2]:5.1f})  dx0={c0[0]-r0[0]:+5.2f} dy={c0[2]-r0[2]:+5.2f}")
        else:
            print(f"{t:22s} {r0[0]:6.1f}..{r0[1]:6.1f} ({r0[2]:5.1f})  MISSING")
for t, cv in cw.items():
    for i, c0 in enumerate(cv):
        rv = rw.get(t, [])
        if i >= len(rv):
            print(f"{t:22s} EXTRA in cur at {c0[0]:6.1f}..{c0[1]:6.1f} ({c0[2]:5.1f})")
