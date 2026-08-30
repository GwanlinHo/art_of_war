# -*- coding: utf-8 -*-
"""產生前端用的 sunzi.js。

原文一律以 scripts/source/ws_chapters.json（維基文庫通行本，武經七書系統）
搭配 scripts/sections.json 的分節規格產生，不手動編輯；
白話與要義解讀放在 scripts/content.json。
"""
import io, json, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(*parts):
    with io.open(os.path.join(BASE, "scripts", *parts), encoding="utf-8") as f:
        return json.load(f)

def to_blocks(value):
    """字串或字串陣列 -> 統一的區塊格式"""
    if not value:
        return []
    if isinstance(value, str):
        value = [value]
    out = []
    for item in value:
        if isinstance(item, dict):
            out.append({"type": item.get("type", "p"), "lines": item["lines"]})
        else:
            out.append({"type": "p", "lines": [item]})
    return out

def count(blocks):
    return sum(len(l) for b in blocks for l in b["lines"])

def main():
    chapters = {c["no"]: c for c in load("source", "ws_chapters.json")}
    spec = load("sections.json")
    content = {int(c["no"]): c for c in load("content.json")}

    out, missing = [], []
    no = 0
    for ch in spec["chapters"]:
        src = chapters[ch["no"]]
        covered = []
        for sec in ch["sections"]:
            no += 1
            covered += sec["paras"]
            c = content.get(no, {})
            plain = to_blocks(c.get("plain"))
            essence = to_blocks(c.get("essence"))
            if not plain or not essence:
                missing.append(no)
            out.append({
                "no": no,
                "chapter": ch["no"],
                "chapterName": ch["name"],
                "name": sec["name"],
                "text": [{"type": "p", "lines": [src["paras"][i]]} for i in sec["paras"]],
                "plain": plain,
                "essence": essence,
            })
        if covered != list(range(len(src["paras"]))):
            print("[X] %s 的段落覆蓋不完整：%s" % (ch["name"], covered))
            return 1

    js = ("/* 本檔由 scripts/build_data.py 自動產生，請勿直接編輯。\n"
          " * 原文：《孫子兵法》十三篇，維基文庫通行本（武經七書系統）\n"
          " * 分節與節名：本站所定，非原典固有\n"
          " * 白話與要義解讀：本專案自行撰寫 */\n"
          "window.SUNZI = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")
    with io.open(os.path.join(BASE, "sunzi.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print("[O] 產生 sunzi.js：%d 篇 %d 節，原文 %d 字，白話 %d 字，解讀 %d 字" % (
        len(spec["chapters"]), len(out),
        sum(count(o["text"]) for o in out),
        sum(count(o["plain"]) for o in out),
        sum(count(o["essence"]) for o in out)))
    if missing:
        print("[!] 尚未撰寫白話或解讀的節：%s" % ",".join(str(m) for m in missing))
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
