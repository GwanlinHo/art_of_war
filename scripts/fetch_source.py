# -*- coding: utf-8 -*-
"""抓取中國哲學書電子化計劃（ctext.org）的《孫子兵法》十三篇原始 HTML，
存進 scripts/source/ 供後續解析與比對。低頻抓取，每篇間隔數秒。"""
import io, os, sys, time, urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "scripts", "source")

CHAPTERS = [
    (1, "始計", "laying-plans"),
    (2, "作戰", "waging-war"),
    (3, "謀攻", "attack-by-stratagem"),
    (4, "軍形", "tactical-dispositions"),
    (5, "兵勢", "energy"),
    (6, "虛實", "weak-points-and-strong"),
    (7, "軍爭", "maneuvering"),
    (8, "九變", "variation-in-tactics"),
    (9, "行軍", "the-army-on-the-march"),
    (10, "地形", "terrain"),
    (11, "九地", "the-nine-situations"),
    (12, "火攻", "the-attack-by-fire"),
    (13, "用間", "the-use-of-spies"),
]

def main():
    for no, name, slug in CHAPTERS:
        path = os.path.join(OUT, "ctext_%02d.html" % no)
        if os.path.exists(path):
            print("[-] 已存在，略過：%s %s" % (no, name))
            continue
        url = "https://ctext.org/art-of-war/%s/zh" % slug
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read().decode("utf-8", "ignore")
        io.open(path, "w", encoding="utf-8").write(data)
        print("[O] %2d %s  %d bytes" % (no, name, len(data)))
        time.sleep(3)
    return 0

if __name__ == "__main__":
    sys.exit(main())
