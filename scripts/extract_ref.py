#!/usr/bin/env python3
"""Extract exact vector geometry + colors + text from the reference PDF (page 1 & 5).
pdfplumber coordinates: top-left origin, units = points (612x792 for Letter)."""
import pdfplumber, sys

PDF = "upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf"
page_no = int(sys.argv[1]) if len(sys.argv) > 1 else 1

with pdfplumber.open(PDF) as pdf:
    p = pdf.pages[page_no - 1]
    print(f"=== PAGE {page_no}  size {p.width}x{p.height} ===")

    if page_no == 1:
        print("\n--- RECTS (x0, top, x1, bottom, w, h, fill, stroke) ---")
        for r in p.rects:
            if r["top"] > 340:  # summary + below region of interest
                continue
            fill = r.get("non_stroking_color"); stroke = r.get("stroking_color")
            print(f"rect ({r['x0']:7.2f},{r['top']:7.2f})-({r['x1']:7.2f},{r['bottom']:7.2f}) w={r['width']:6.2f} h={r['height']:6.2f} fill={fill} stroke={stroke} lw={r.get('linewidth')}")
        print("\n--- CURVES (circles/donut segments) in summary area ---")
        for c in p.curves:
            if c["top"] > 340 or c["bottom"] < 170:
                continue
            fill = c.get("non_stroking_color"); stroke = c.get("stroking_color")
            print(f"curve ({c['x0']:7.2f},{c['top']:7.2f})-({c['x1']:7.2f},{c['bottom']:7.2f}) fill={fill} stroke={stroke} lw={c.get('linewidth')}")
        print("\n--- LINES in summary area ---")
        for l in p.lines:
            if l["top"] > 340 or l["bottom"] < 170:
                continue
            print(f"line ({l['x0']:7.2f},{l['top']:7.2f})-({l['x1']:7.2f},{l['bottom']:7.2f}) stroke={l.get('stroking_color')} lw={l.get('linewidth')}")
        print("\n--- WORDS in summary band (top 170..340) ---")
        for w in p.extract_words(extra_attrs=["fontname", "size"]):
            if 170 <= w["top"] <= 345:
                col = w.get("non_stroking_color", "?")
                print(f"w '{w['text']}' ({w['x0']:6.1f},{w['top']:6.1f})-({w['x1']:6.1f}) font={w['fontname']} size={w['size']:.1f} color={col}")
    elif page_no == 5:
        print("\n--- RECTS ---")
        for r in p.rects:
            fill = r.get("non_stroking_color"); stroke = r.get("stroking_color")
            print(f"rect ({r['x0']:7.2f},{r['top']:7.2f})-({r['x1']:7.2f},{r['bottom']:7.2f}) w={r['width']:6.2f} h={r['height']:6.2f} fill={fill} stroke={stroke} lw={r.get('linewidth')}")
        print("\n--- CURVES ---")
        for c in p.curves:
            fill = c.get("non_stroking_color"); stroke = c.get("stroking_color")
            print(f"curve ({c['x0']:7.2f},{c['top']:7.2f})-({c['x1']:7.2f},{c['bottom']:7.2f}) fill={fill} stroke={stroke} lw={c.get('linewidth')}")
        print("\n--- WORDS ---")
        for w in p.extract_words(extra_attrs=["fontname", "size"]):
            print(f"w '{w['text']}' ({w['x0']:6.1f},{w['top']:6.1f}) font={w['fontname']} size={w['size']:.1f}")
