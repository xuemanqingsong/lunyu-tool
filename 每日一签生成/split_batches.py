#!/usr/bin/env python3
"""把 full_506.json 切成 10 个批次输入文件（供子代理生成 中线索/强线索/今日一试）"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "..", "..", "full_506.json")
OUT = os.path.join(BASE, "batches")

with open(SRC, encoding="utf-8") as f:
    data = json.load(f)

assert len(data) == 506, f"章节数不对: {len(data)}"
assert [c["id"] for c in data] == list(range(1, 507)), "id 不连续"

# 6×51 + 4×50 = 506
sizes = [51] * 6 + [50] * 4
batches = []
i = 0
for n in sizes:
    batches.append(data[i:i + n])
    i += n

os.makedirs(OUT, exist_ok=True)
for k, b in enumerate(batches, 1):
    slim = [{
        "id": c["id"],
        "text": c["text"],
        "source": c["source"],
        "translation": c["translation"],
        "scene": c.get("scene", ""),
        "insight": c["insight"],
        "practice_old": c["practice"],
    } for c in b]
    p = os.path.join(OUT, f"in_{k:02d}.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(slim, f, ensure_ascii=False, indent=1)
    print(f"in_{k:02d}.json  {len(slim)} 章  id {slim[0]['id']}–{slim[-1]['id']}")
