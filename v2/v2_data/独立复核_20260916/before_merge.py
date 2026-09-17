# -*- coding: utf-8 -*-
"""合并 21 批产出回 v2 数据。
输入：v2_data/产出/批*.json（每章 {id, scenes:[3], practices:[3]}）
      ../../full_506.json（原文/白话/讲解/主题）
输出：../data.js（window.LUNYU_V2，每章新增 scenes/practices 数组）
"""
import json, os, glob, re, collections

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE, "产出")
SRC_FULL = os.path.join(BASE, "..", "..", "..", "full_506.json")
OUT_JS = os.path.join(BASE, "..", "data.js")

with open(SRC_FULL, encoding="utf-8") as f:
    full = json.load(f)
BY_ID = {d["id"]: d for d in full}

# 主题映射（复用 make_data.py 的规则，简化：读现有 data.js 的 theme）
# 从旧 data.js 读取每章的 theme
old_js = open(os.path.join(BASE, "..", "data.js"), encoding="utf-8").read()
m = re.search(r"window\.LUNYU_V2\s*=\s*(\[.*?\])\s*;", old_js, re.S)
old_data = json.loads(m.group(1))
THEME_BY_ID = {d["id"]: d.get("theme", ["内心"]) for d in old_data}

# 读取全部产出
produced = {}  # id -> {scenes, practices}
for fp in sorted(glob.glob(os.path.join(OUT_DIR, "批*.json"))):
    with open(fp, encoding="utf-8") as f:
        batch = json.load(f)
    for item in batch:
        produced[item["id"]] = item
    print(f"读取 {os.path.basename(fp)}: {len(batch)} 章")

print(f"\n共产出 {len(produced)} 章（应 506）")
missing = [i for i in range(1, 507) if i not in produced]
print("缺失 id:", missing if missing else "无")

# 组装新 data.js
out = []
stat = collections.Counter()
for d in full:
    rec = {
        "id": d["id"],
        "theme": THEME_BY_ID.get(d["id"], ["内心"]),
        "scenes": produced[d["id"]]["scenes"],
        "practices": produced[d["id"]]["practices"],
        "text": d["text"],
        "source": d["source"],
        "translation": d["translation"],
        "insight": d["insight"],
    }
    out.append(rec)
    for s in rec["scenes"]:
        stat["scenes"] += 1
    for p in rec["practices"]:
        stat["practices"] += 1

js = "// 论语小工具 v2 情境版 · 全量数据（每章 3 情境 + 3 今日行动）\n// 字段：id/theme/scenes/practices/text/source/translation/insight\nwindow.LUNYU_V2 = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n"
with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write(js)
print(f"\n已写出 {OUT_JS} ({os.path.getsize(OUT_JS)} bytes)")
print(f"总情境条数: {stat['scenes']}，总行动条数: {stat['practices']}")
