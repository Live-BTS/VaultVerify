"""Golden comparison: python scripts/compare-pdfs.py approved-design.pdf candidate.pdf
Rasterises both at 100 dpi and reports differing pixels per page. Needs: poppler (pdftoppm), pillow, numpy."""
import subprocess, sys, tempfile, os
from PIL import Image
import numpy as np
a, b = sys.argv[1], sys.argv[2]
with tempfile.TemporaryDirectory() as d:
    for tag, f in (("a", a), ("b", b)):
        subprocess.run(["pdftoppm", "-r", "100", "-png", f, os.path.join(d, tag)], check=True)
    pa = sorted(x for x in os.listdir(d) if x.startswith("a"))
    pb = sorted(x for x in os.listdir(d) if x.startswith("b"))
    print("pages:", len(pa), "vs", len(pb))
    ok = len(pa) == len(pb)
    for x, y in zip(pa, pb):
        ia = np.asarray(Image.open(os.path.join(d, x)).convert("RGB")).astype(int)
        ib = np.asarray(Image.open(os.path.join(d, y)).convert("RGB")).astype(int)
        if ia.shape != ib.shape:
            print(x, "size mismatch"); ok = False; continue
        n = int((np.abs(ia - ib).max(axis=2) > 40).sum())
        print(x, "differing pixels:", n)
        ok &= n < 300   # tolerance: a few hairline/dash pixels
    print("PASS" if ok else "FAIL"); sys.exit(0 if ok else 1)
