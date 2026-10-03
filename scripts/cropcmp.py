#!/usr/bin/env python3
"""Crop matching regions from ref/current PDF renders for precise comparison."""
from PIL import Image

# renders at 150 dpi: PDF page 612x792pt -> 1275x1650 px; design space 1020x1320 -> factor 1.25
F = 1.25

def crop(src, out, dx, dy, dw, dh):
    im = Image.open(src)
    px = im.crop((int(dx*F), int(dy*F), int((dx+dw)*F), int((dy+dh)*F)))
    # upscale 2x for readability
    px = px.resize((px.width*2, px.height*2), Image.LANCZOS)
    px.save(out)
    print(out, px.size)

# ref page 1: rating scale row + last performed row
crop("/home/z/my-project/download/pdfcmp/ref/h-1.png", "/home/z/my-project/download/pdfcmp/ref-scale.png", 60, 875, 900, 85)
crop("/home/z/my-project/download/pdfcmp/cur/h-1.png", "/home/z/my-project/download/pdfcmp/cur-scale.png", 60, 875, 900, 85)
# ref page 1: first skill rows (rings 3 and 4)
crop("/home/z/my-project/download/pdfcmp/ref/h-1.png", "/home/z/my-project/download/pdfcmp/ref-rows.png", 480, 1055, 500, 130)
crop("/home/z/my-project/download/pdfcmp/cur/h2-2.png", "/home/z/my-project/download/pdfcmp/cur-rows.png", 480, 125, 500, 130)
# ref page 2: rows with rating 2, 1 (rings)
crop("/home/z/my-project/download/pdfcmp/ref/h-2.png", "/home/z/my-project/download/pdfcmp/ref-rows21.png", 480, 240, 500, 140)
# header bottom edge page 1 (green strip check)
crop("/home/z/my-project/download/pdfcmp/ref/h-1.png", "/home/z/my-project/download/pdfcmp/ref-hdr.png", 0, 100, 1020, 90)
crop("/home/z/my-project/download/pdfcmp/cur/h-1.png", "/home/z/my-project/download/pdfcmp/cur-hdr.png", 0, 100, 1020, 90)
# slim header pages 2+
crop("/home/z/my-project/download/pdfcmp/ref/h-2.png", "/home/z/my-project/download/pdfcmp/ref-hdr2.png", 0, 0, 1020, 120)
crop("/home/z/my-project/download/pdfcmp/cur/h2-2.png", "/home/z/my-project/download/pdfcmp/cur-hdr2.png", 0, 0, 1020, 120)
