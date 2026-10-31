# -*- coding: utf-8 -*-
"""F1 素材后处理：四角洪水去白底 → 透明 PNG → 512px 压缩。依赖 Pillow。
用法：python web/scripts/post-assets.py"""
import glob, os
from PIL import Image, ImageDraw

DIR = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "generated")

for p in glob.glob(os.path.join(DIR, "*.png")):
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    already = sum(im.split()[3].histogram()[:8]) / (w * h) > 0.03  # 已含透明则跳过去底
    if not already:
        rgb = im.convert("RGB")
        for c in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
            if min(rgb.getpixel(c)) >= 232:
                ImageDraw.floodfill(rgb, c, (255, 0, 254), thresh=40)
        src, rp = im.load(), rgb.load()
        for y in range(h):
            for x in range(w):
                if rp[x, y] == (255, 0, 254):
                    r, g, b, _ = src[x, y]
                    src[x, y] = (r, g, b, 0)
    im.thumbnail((512, 512), Image.LANCZOS)
    im.save(p, "PNG", optimize=True)
    print("post", os.path.basename(p), "%.0fKB" % (os.path.getsize(p) / 1024), flush=True)
print("DONE", flush=True)
