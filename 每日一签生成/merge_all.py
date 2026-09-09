#!/usr/bin/env python3
"""合并 10 个批次输出 + full_506.json → qian/data-qian-1/2/3.js，并做全量校验"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
BATCHES = os.path.join(BASE, "batches")
SRC = os.path.join(BASE, "..", "..", "full_506.json")
QIAN_DIR = os.path.join(BASE, "..", "qian")

PERIOD_RE = re.compile(r"本周|这周|一周内|接下来|未来|三个月|长期|本月|整月|这一月|一个月内")

# ---- 1. 读批次输出 ----
out_by_id = {}
problems = []
for k in range(1, 11):
    p = os.path.join(BATCHES, f"out_{k:02d}.json")
    if not os.path.exists(p):
        problems.append(f"缺少 out_{k:02d}.json")
        continue
    try:
        rows = json.load(open(p, encoding="utf-8"))
    except json.JSONDecodeError as e:
        problems.append(f"out_{k:02d}.json 解析失败: {e}")
        continue
    for i, r in enumerate(rows):
        cid = r.get("id")
        if cid is None:
            problems.append(f"out_{k:02d}[{i}] 缺 id")
            continue
        if cid in out_by_id:
            problems.append(f"out_{k:02d} 重复 id {cid}")
            continue
        for f in ("clue_m", "clue_s", "practice"):
            v = r.get(f)
            if not v or not str(v).strip():
                problems.append(f"id {cid} 字段 {f} 为空")
        if r.get("clue_m") == r.get("clue_s"):
            problems.append(f"id {cid} clue_m == clue_s")
        if PERIOD_RE.search(r.get("practice") or ""):
            problems.append(f"id {cid} practice 含周期词")
        out_by_id[cid] = r


# ---- 2. 与源数据合并 ----
src = json.load(open(SRC, encoding="utf-8"))
assert len(src) == 506

missing = [c["id"] for c in src if c["id"] not in out_by_id]
if missing:
    problems.append(f"缺 {len(missing)} 章的生成结果: {missing[:20]}{'...' if len(missing) > 20 else ''}")

if problems:
    print("发现以下问题，不生成数据文件：")
    for p in problems:
        print("  -", p)
    sys.exit(1)

merged = []
for c in src:
    o = out_by_id[c["id"]]
    merged.append({
        "id": c["id"],
        "text": c["text"],
        "source": c["source"],
        "translation": c["translation"],
        "insight": c["insight"],
        "clue_m": o["clue_m"].strip(),
        "clue_s": o["clue_s"].strip(),
        "practice": o["practice"].strip(),
    })

# ---- 3. 切三个数据文件（与 workbuddy 三文件惯例一致）----
n1 = 169
n2 = 169
parts = [merged[:n1], merged[n1:n1 + n2], merged[n1 + n2:]]
names = ["学而第一～雍也第六", "述而第七～颜渊第十二", "子路第十三～尧曰第二十"]
os.makedirs(QIAN_DIR, exist_ok=True)
for i, (part, nm) in enumerate(zip(parts, names), 1):
    p = os.path.join(QIAN_DIR, f"data-qian-{i}.js")
    with open(p, "w", encoding="utf-8") as f:
        f.write(f"// 时习 · 论语每日一签 · 第{i}部分：{nm}\n")
        f.write(f"// 每章：id/原文/篇目/白话/引申解读/中线索clue_m/强线索clue_s/今日一试practice\n")
        f.write(f"window.LUNYU_QIAN_{i} = ")
        f.write(json.dumps(part, ensure_ascii=False, indent=1))
        f.write(";\n")
    print(f"data-qian-{i}.js  {len(part)} 章")

print(f"合并完成：506/506 章，全部字段齐全")
