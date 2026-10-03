#!/usr/bin/env python3
"""Cluster remaining diff pixels on page 1 (pure-numpy BFS) and report bounding boxes."""
import numpy as np
from PIL import Image
from collections import deque

r = np.asarray(Image.open("download/pdfnew/ref3/p-1.png").convert("RGB")).astype(int)
c = np.asarray(Image.open("download/pdfnew/cur3/p-1.png").convert("RGB")).astype(int)
d = (np.abs(r - c).sum(axis=2) > 40)
H, W = d.shape
seen = np.zeros_like(d, dtype=bool)
S = 150 / 72

clusters = []
for sy in range(H):
    row = d[sy]
    for sx in range(W):
        if row[sx] and not seen[sy, sx]:
            q = deque([(sy, sx)]); seen[sy, sx] = True
            x0 = x1 = sx; y0 = y1 = sy; n = 0
            while q:
                y, x = q.popleft(); n += 1
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < H and 0 <= xx < W and d[yy, xx] and not seen[yy, xx]:
                            seen[yy, xx] = True; q.append((yy, xx))
            clusters.append((x0, y0, x1, y1, n))

clusters.sort(key=lambda b: -b[4])
print(f"{len(clusters)} clusters, total px {int(d.sum())}")
for x0, y0, x1, y1, n in clusters[:35]:
    if n < 12: continue
    print(f"px ({x0:5d},{y0:5d})-({x1:5d},{y1:5d})  pt ({x0/S:6.1f},{y0/S:6.1f})-({x1/S:6.1f},{y1/S:6.1f})  {x1-x0:4d}x{y1-y0:3d}  n={n}")
