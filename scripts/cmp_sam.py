#!/usr/bin/env python3
"""Compare reference 'Sam Full-Colors' PDF vs current renderer output, page by page."""
import numpy as np
from PIL import Image
import sys, os

REF = "download/pdfnew/ref3"
CUR = "download/pdfnew/cur3"
OUT = "download/pdfnew/cmp"
os.makedirs(OUT, exist_ok=True)

def load(p):
    im = Image.open(p).convert("RGB")
    return np.asarray(im).astype(int)

total_diffs = 0
for i in range(1, 6):
    r = load(f"{REF}/p-{i}.png")
    c = load(f"{CUR}/p-{i}.png")
    if r.shape != c.shape:
        print(f"page {i}: SIZE MISMATCH ref={r.shape} cur={c.shape}")
        h = min(r.shape[0], c.shape[0]); w = min(r.shape[1], c.shape[1])
        r, c = r[:h, :w], c[:h, :w]
    d = np.abs(r - c).sum(axis=2)
    mask = d > 40  # tolerance for anti-aliasing
    n = int(mask.sum())
    total_diffs += n
    print(f"page {i}: {r.shape[1]}x{r.shape[0]}  differing px: {n}")
    # heat overlay: red where different
    ov = c.copy()
    ov[mask] = [255, 0, 0]
    Image.fromarray(ov.astype(np.uint8)).save(f"{OUT}/diff-{i}.png")
    # side-by-side
    sbs = np.concatenate([r, c], axis=1)
    Image.fromarray(sbs.astype(np.uint8)).save(f"{OUT}/sbs-{i}.png")
print("TOTAL differing px:", total_diffs)
