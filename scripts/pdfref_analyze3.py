#!/usr/bin/env python3
"""Follow-up: pills, ring zoom, header line, text colors."""
from PIL import Image
BASE = "/home/z/my-project/download/pdfcheck"
p1 = Image.open(f"{BASE}/refhi-1.png").convert("RGB")
p5 = Image.open(f"{BASE}/refhi-5.png").convert("RGB")

def hexat(img, x, y):
    r, g, b = img.getpixel((x, y))
    return f"#{r:02x}{g:02x}{b:02x}"

def vscan(img, x, y0, y1, label):
    prev = None; out = []
    for y in range(y0, y1):
        q = tuple(v // 12 for v in img.getpixel((x, y)))
        if q != prev: out.append(f"y={y}:{hexat(img,x,y)}"); prev = q
    print(f"[vscan {label} x={x}] " + " ".join(out))

def hscan(img, y, x0, x1, label, maxn=50):
    prev = None; out = []
    for x in range(x0, x1):
        q = tuple(v // 12 for v in img.getpixel((x, y)))
        if q != prev: out.append(f"x={x}:{hexat(img,x,y)}"); prev = q
    print(f"[hscan {label} y={y}] " + " ".join(out[:maxn]))

vscan(p1, 200, 200, 248, "RN pill vertical")
vscan(p1, 265, 200, 248, "General pill vertical")
hscan(p1, 133, 0, 300, "p1 y=133 green line?")
hscan(p1, 137, 0, 300, "p1 y=137")
hscan(p1, 944, 440, 740, "legend pale pill")
hscan(p1, 1001, 460, 640, "table band Rating text")
hscan(p1, 1098, 95, 540, "skill name + dotted leader")
hscan(p1, 1088, 700, 960, "row1 recency pill extent")
vscan(p1, 700, 1104, 1124, "row divider between rows")
hscan(p1, 415, 550, 620, "recent donut pale seg")
hscan(p1, 1268, 60, 350, "footer texts")
print("73 skills assessed gray:", hexat(p1, 900, 352))
print("mix legend label:", hexat(p1, 280, 428))
print("p5 statement text:", hexat(p5, 200, 690))
print("p5 question gray:", hexat(p5, 100, 404))
print("p5 card heading:", hexat(p5, 110, 620))
print("p1 heading sample2:", hexat(p1, 104, 350), hexat(p1, 112, 349))

# ring zoom: 300dpi render of page1 region around ring (536,1095) and legend ring1 (200,908)
import subprocess
subprocess.run(["pdftoppm","-png","-r","300","-f","1","-l","1",
  "/home/z/my-project/upload/VaultVerify-Skills-Checklist-Sam-Full-Colors (3).pdf",
  f"{BASE}/ref300"],check=True)
big = Image.open(f"{BASE}/ref300-1.png").convert("RGB")
print("300dpi size:", big.size)
K = 2.5
box = (int(505*K), int(1065*K), int(575*K), int(1135*K))
big.crop(box).resize((560,560), Image.NEAREST).save(f"{BASE}/crops/ring_row.png")
box2 = (int(180*K), int(880*K), int(230*K), int(935*K))
big.crop(box2).resize((400,440), Image.NEAREST).save(f"{BASE}/crops/ring_legend.png")
print("ring crops saved")
