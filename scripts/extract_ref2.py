#!/usr/bin/env python3
"""Extract page-1 lower geometry + exact char colors from reference PDF."""
import pdfplumber
from collections import defaultdict

PDF = "upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf"

def col(c):
    if c is None: return "?"
    if isinstance(c, (int, float)): return f"gray{c:.3f}"
    return "(" + ",".join(f"{v:.3f}" for v in c) + ")"

with pdfplumber.open(PDF) as pdf:
    p = pdf.pages[0]

    # group chars into words with color
    print("--- WORDS w/ color, y-bands 340..800 (legends+table) ---")
    words = defaultdict(list)
    for ch in p.chars:
        key = (round(ch["top"], 1), round(ch["x0"], 1))
        pass
    # simpler: use extract_words then map nearest char color via doctop
    for w in p.extract_words(extra_attrs=["fontname", "size"]):
        if not (340 <= w["top"] <= 800): continue
        # find first char inside to get color
        ccol = None
        for ch in p.chars:
            if abs(ch["top"] - w["top"]) < 1.2 and abs(ch["x0"] - w["x0"]) < 1.2:
                ccol = ch.get("non_stroking_color"); break
        print(f"w '{w['text']}' x={w['x0']:6.1f} top={w['top']:6.1f} font={w['fontname'].split('+')[1]} size={w['size']:.1f} color={col(ccol)}")

    print("\n--- RECTS y 520..800 (table header, bands, chips) ---")
    for r in p.rects:
        if not (520 <= r["top"] <= 800): continue
        print(f"rect ({r['x0']:6.1f},{r['top']:6.1f})-({r['x1']:6.1f},{r['bottom']:6.1f}) fill={col(r.get('non_stroking_color'))} stroke={col(r.get('stroking_color'))} lw={r.get('linewidth')}")

    print("\n--- CURVES y 520..800 (rings, dots) ---")
    for c in p.curves:
        if not (520 <= c["top"] <= 800): continue
        print(f"curve ({c['x0']:6.1f},{c['top']:6.1f})-({c['x1']:6.1f},{c['bottom']:6.1f}) stroke={col(c.get('stroking_color'))} lw={c.get('linewidth')} fill={col(c.get('non_stroking_color'))}")

    print("\n--- LINES y 520..800 (leaders, separators) ---")
    for l in p.lines:
        if not (520 <= l["top"] <= 800): continue
        print(f"line ({l['x0']:6.1f},{l['top']:6.1f})-({l['x1']:6.1f},{l['bottom']:6.1f}) stroke={col(l.get('stroking_color'))} lw={l.get('linewidth')} dash={l.get('dash')}")

    print("\n--- summary card title/label colors (chars top 195..300, x<310) ---")
    seen = set()
    for ch in p.chars:
        if 195 <= ch["top"] <= 312:
            k = (ch["text"] if False else None)
            c = col(ch.get("non_stroking_color"))
            key = (round(ch["top"],0), c)
            if key not in seen:
                seen.add(key)
                print(f"char '{ch['text']}' top={ch['top']:.1f} x={ch['x0']:.1f} color={c} font={ch['fontname'].split('+')[1]} size={ch['size']:.1f}")
