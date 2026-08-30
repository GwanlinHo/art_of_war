# -*- coding: utf-8 -*-
"""把 scripts/source/wikisource_sunzi.txt（維基文庫原始 wikitext）解析成
scripts/source/ws_chapters.json（十三篇、逐段）。原文只從這裡來，不手動編輯。"""
import io, json, os, re, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def parse(wikitext):
    body = wikitext[wikitext.index("== 始計第一 =="):]
    parts = re.split(r"^==\s*(.+?)\s*==$", body, flags=re.M)
    chapters = []
    for i in range(1, len(parts), 2):
        name = parts[i].strip()
        if name == "答話":          # 維基文庫頁尾的討論區，不屬於本文
            break
        text = parts[i + 1]
        text = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", text)   # [[連結|顯示]] -> 顯示
        text = re.sub(r"\[\[([^\]]*)\]\]", r"\1", text)
        text = re.sub(r"\{\{[^}]*\}\}", "", text)
        text = re.sub(r"<[^>]+>", "", text)
        paras = [p.strip() for p in text.split("\n") if p.strip()]
        chapters.append({"no": len(chapters) + 1, "name": name, "paras": paras})
    return chapters

def main():
    src = os.path.join(BASE, "scripts", "source", "wikisource_sunzi.txt")
    chapters = parse(io.open(src, encoding="utf-8").read())
    out = os.path.join(BASE, "scripts", "source", "ws_chapters.json")
    json.dump(chapters, io.open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("[O] 解析 %d 篇 %d 段 %d 字" % (
        len(chapters),
        sum(len(c["paras"]) for c in chapters),
        sum(len(p) for c in chapters for p in c["paras"])))
    return 0

if __name__ == "__main__":
    sys.exit(main())
