# -*- coding: utf-8 -*-
"""資料完整性測試：sunzi.js 的原文必須與維基文庫原始 wikitext 逐字一致，
篇數節數、分節覆蓋、白話與要義解讀齊備。"""
import io, json, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "scripts"))
import parse_source  # noqa: E402

fail = 0

def ok(cond, msg):
    global fail
    print(("[O] " if cond else "[X] ") + msg)
    if not cond:
        fail += 1

def load_js():
    src = io.open(os.path.join(BASE, "sunzi.js"), encoding="utf-8").read()
    body = src[src.index("window.SUNZI =") + len("window.SUNZI ="):].rstrip()
    assert body.endswith(";")
    return json.loads(body[:-1])

def load_spec():
    return json.load(io.open(os.path.join(BASE, "scripts", "sections.json"), encoding="utf-8"))

BOOKS = ["始計第一", "作戰第二", "謀攻第三", "軍形第四", "兵勢第五", "虛實第六",
         "軍爭第七", "九變第八", "行軍第九", "地形第十", "九地第十一",
         "火攻第十二", "用間第十三"]

def blocks_text(blocks):
    return "".join(l for b in blocks for l in b["lines"])

def main():
    data = load_js()
    spec = load_spec()
    raw = io.open(os.path.join(BASE, "scripts", "source", "wikisource_sunzi.txt"),
                  encoding="utf-8").read()
    chapters = parse_source.parse(raw)

    ok(len(chapters) == 13, "來源解析出 13 篇（%d）" % len(chapters))
    ok([c["name"] for c in chapters] == BOOKS, "十三篇篇名正確")

    expected_sections = sum(len(ch["sections"]) for ch in spec["chapters"])
    ok(len(data) == expected_sections, "節數與分節規格一致（%d）" % len(data))
    ok([d["no"] for d in data] == list(range(1, len(data) + 1)), "節序連續無缺")
    ok(sorted(set(d["chapter"] for d in data)) == list(range(1, 14)), "十三篇都有節")
    ok([d["chapterName"] for d in data if d["no"] == 1] == ["始計第一"], "第一節屬始計第一")

    # 原文逐字比對：把每篇的節串起來，必須等於來源該篇的所有段落
    for ch_spec, src in zip(spec["chapters"], chapters):
        secs = [d for d in data if d["chapter"] == ch_spec["no"]]
        joined = "".join(blocks_text(s["text"]) for s in secs)
        ok(joined == "".join(src["paras"]),
           "%s 原文與維基文庫來源逐字一致（%d 字）" % (src["name"], len(joined)))

    # 分節必須不重不漏地覆蓋每篇的所有段落
    for ch_spec, src in zip(spec["chapters"], chapters):
        covered = [i for s in ch_spec["sections"] for i in s["paras"]]
        ok(covered == list(range(len(src["paras"]))),
           "%s 分節不重不漏覆蓋 %d 段" % (src["name"], len(src["paras"])))

    empty_plain = [d["no"] for d in data if not blocks_text(d["plain"]).strip()]
    empty_ess = [d["no"] for d in data if not blocks_text(d["essence"]).strip()]
    ok(not empty_plain, "每一節都有白話（缺：%s）" % empty_plain)
    ok(not empty_ess, "每一節都有要義解讀（缺：%s）" % empty_ess)

    same = [d["no"] for d in data if blocks_text(d["plain"]) == blocks_text(d["text"])]
    ok(not same, "白話不是原文照抄（可疑：%s）" % same)

    short = [d["no"] for d in data if len(blocks_text(d["essence"])) < 100]
    ok(not short, "每節要義解讀至少 100 字（過短：%s）" % short)

    ok(all(d["name"].strip() for d in data), "每一節都有節名")

    joined_all = "".join(blocks_text(d["plain"]) + blocks_text(d["essence"]) for d in data)
    # 只列真正的簡化字；「云」「后」「几」等在文言中本即正體，不可列入
    bad_simp = set("们为这来说无东单发点买卖问闻见龙话读经过时应还随说军战队马鸟节势")
    hits = sorted(set(c for c in joined_all if c in bad_simp))
    ok(not hits, "白話與解讀無簡體字（發現：%s）" % "".join(hits))
    ok(not [c for c in joined_all if ord(c) > 0x1F000], "白話與解讀無 emoji")

    print("[O] ALL DATA TESTS PASSED" if fail == 0 else "[X] DATA TESTS FAILED")
    return 1 if fail else 0

if __name__ == "__main__":
    sys.exit(main())
